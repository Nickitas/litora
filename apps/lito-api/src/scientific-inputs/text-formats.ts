import { BadRequestException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import type { ScientificInputRole } from "@litora/contracts";
import { scientificInputFormat } from "./format-catalog.js";
import { validateScientificJSON } from "./json-formats.js";

const invalid = (message: string): never => { throw new BadRequestException(`Формат научного файла: ${message}`); };
const numeric = (value: string) => value.trim() !== "" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value) && Number.isFinite(Number(value));
const integer = (value: string, minimum = 0) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;

async function* characters(path: string): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let first = true;
  try {
    for await (const chunk of createReadStream(path)) {
      const bytes = chunk as Buffer;
      if (first && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) invalid("требуется UTF-8 без BOM");
      first = false;
      yield decoder.decode(bytes, { stream: true });
    }
    const end = decoder.decode(); if (end) yield end;
  } catch (error) {
    if (error instanceof TypeError) invalid("требуется корректная кодировка UTF-8");
    throw error;
  }
}

// Потоковый разбор CSV/TSV с кавычками, без загрузки файла целиком в память.
export async function* delimitedRows(path: string, separator: string): AsyncGenerator<string[]> {
  let row: string[] = []; let field = ""; let quoted = false; let closed = false; let pendingCR = false;
  for await (const chunk of characters(path)) for (const character of chunk) {
    if (character === "\0") invalid("нулевой байт в текстовом файле");
    if (pendingCR) { pendingCR = false; if (character === "\n") continue; }
    if (quoted) { if (character === '"') { quoted = false; closed = true; } else field += character; }
    else if (closed && character === '"') { field += '"'; quoted = true; closed = false; }
    else if (character === separator || character === "\n" || character === "\r") {
      row.push(field); field = ""; closed = false;
      if (row.length > 128) invalid("более 128 колонок");
      if (character !== separator) { yield row; row = []; pendingCR = character === "\r"; }
    } else if (closed) invalid("символ после закрывающей кавычки");
    else if (character === '"') { if (field !== "") invalid("кавычка внутри неэкранированного поля"); quoted = true; }
    else field += character;
    if (field.length > 1024 * 1024) invalid("поле таблицы превышает 1 МиБ");
  }
  if (quoted) invalid("незакрытые кавычки");
  if (row.length || field || closed) yield [...row, field];
}

export async function validateTableFile(path: string, role: ScientificInputRole): Promise<void> {
  const expert = role === "expert_ratings_tsv";
  let header: string[] | undefined; let rows = 0; let physicalRow = 0;
  const ids = new Set<string>();
  for await (const raw of delimitedRows(path, expert ? "\t" : ",")) {
    physicalRow++;
    const row = raw.map((field) => field.trim());
    if (row.every((field) => field === "")) continue;
    if (!header) {
      header = row;
      if (new Set(row).size !== row.length) invalid("повторяющиеся колонки");
      if (expert) {
        if (row.join("\t") !== "Идентификатор карточки\tОсобенность\tЭксперт\tБерег 1–5\tИзобаты 1–5\tСетка 1–5\tАртефакты 1–5\tКомментарий") invalid("ожидается заголовок листа AI-01 из Go");
      } else {
        const allowed = role === "wave_climate" ? ["time", "duration_hours", "hs_m", "tp_s", "direction_from_deg"] : scientificInputFormat(role).columns ?? [];
        const required = role === "wave_climate" ? allowed.filter((field) => field !== "time") : allowed;
        if (!allowed.length || row.some((field) => !allowed.includes(field)) || required.some((field) => !row.includes(field))) invalid("набор колонок не соответствует схеме выбранной роли");
      }
      continue;
    }
    if (row.length !== header.length) invalid(`строка ${physicalRow}: неверное число колонок`);
    if (expert && physicalRow === 2) { if (!row.every((field) => /^-+$/.test(field))) invalid("нет второй строки заголовка AI-01"); continue; }
    if (expert) {
      const scores = row.slice(3, 7);
      if (scores.every((score) => score === "")) continue;
      if (!row[0] || !row[2] || scores.some((score) => !integer(score, 1) || Number(score) > 5)) invalid(`строка ${physicalRow}: нужны карточка, эксперт и четыре целых балла 1–5`);
      const key = `${row[0]}\0${row[2]}`; if (ids.has(key)) invalid("повторная оценка одной карточки одним экспертом"); ids.add(key);
    } else {
      for (let index = 0; index < header.length; index++) {
        const name = header[index]; const value = row[index];
        if (name === "time") { if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) invalid(`строка ${physicalRow}: time должен быть RFC3339`); }
        else if (name === "schema_version") { if (value !== "lito-adaptive-size-field/v1") invalid("неподдерживаемая версия CSV ADAPT-01"); }
        else if (name === "zone") { if (!value) invalid("пустая зона CSV"); }
        else if (["depth_available", "gradient_available", "growth_limited"].includes(name)) { if (value !== "true" && value !== "false") invalid(`строка ${physicalRow}: ${name} должно быть true/false`); }
        else if (!numeric(value)) invalid(`строка ${physicalRow}: ${name} должно быть конечным числом`);
        if (name === "node_id") { if (!integer(value, 1) || ids.has(value)) invalid("неверный или повторный node_id"); ids.add(value); }
      }
      if (role === "wave_climate") {
        const condition = Object.fromEntries(header.map((name, index) => [name, name === "time" ? row[index] : Number(row[index])]));
        validateScientificJSON(role, { source: "CSV", conditions: [condition] });
      }
    }
    rows++;
  }
  if (!header || rows === 0) invalid("таблица не содержит заполненных записей");
}

async function* boundedLines(path: string) {
  let line = "";
  for await (const chunk of characters(path)) for (const char of chunk) {
    if (char === "\0") invalid("нулевой байт; требуется ASCII MSH 2.2");
    if (char === "\n") { yield line.trim(); line = ""; }
    else line += char;
    if (line.length > 65536) invalid("строка MSH превышает 64 КиБ");
  }
  if (line) yield line.trim();
}

export async function validateMSHFile(path: string, role: ScientificInputRole): Promise<void> {
  const lines = boundedLines(path)[Symbol.asyncIterator]();
  const next = async () => { const row = await lines.next(); if (row.done) return null; return row.value; };
  const required = async (): Promise<string> => { const row = await next(); return row === null ? invalid("оборванный MSH") : row; };
  const count = async (minimum = 0, maximum = 10_000_000) => { const row = await required(); if (!integer(row, minimum) || Number(row) > maximum) invalid("неверный счётчик MSH"); return Number(row); };
  const end = async (section: string) => { if (await required() !== `$End${section}`) invalid(`не закрыт блок ${section}`); };
  const nodes = new Set<number>(); const elements = new Set<number>(); const seen = new Set<string>();
  let model = false; let schema = false;
  try {
    for (let line = await next(); line !== null; line = await next()) {
      if (line === "") continue;
      if (line === "$MeshFormat") {
        if (seen.has(line) || seen.size || await required() !== "2.2 0 8") invalid("поддерживается только MSH 2.2 ASCII (2.2 0 8)");
        seen.add(line); await end("MeshFormat");
      } else if (line === "$Comments") {
        let comment = await required();
        while (comment !== "$EndComments") { if (comment.startsWith("$")) invalid("незакрытый блок Comments"); model ||= comment === "lito_model_kind=seabed"; schema ||= comment === "lito_schema_version=lito-seabed/v1"; comment = await required(); }
      } else if (line === "$PhysicalNames") {
        const total = await count(); for (let i = 0; i < total; i++) if (!/^[012]\s+\d+\s+"[^"\r\n]*"$/.test(await required())) invalid("неверная PhysicalName MSH"); await end("PhysicalNames");
      } else if (line === "$Nodes") {
        if (seen.has(line)) invalid("повторный блок Nodes"); seen.add(line);
        const total = await count(1);
        for (let i = 0; i < total; i++) { const row = (await required()).split(/\s+/); if (row.length !== 4 || !integer(row[0], 1) || row.slice(1).some((v) => !numeric(v)) || nodes.has(Number(row[0]))) invalid("неверный или повторный узел MSH"); nodes.add(Number(row[0])); }
        await end("Nodes");
      } else if (line === "$Elements") {
        if (seen.has(line) || !nodes.size) invalid("Elements должны идти после Nodes без повторов"); seen.add(line);
        const total = await count(1); const nodeCounts: Record<string, number> = { "1": 2, "2": 3, "3": 4, "15": 1 };
        for (let i = 0; i < total; i++) {
          const row = (await required()).split(/\s+/); const tags = Number(row[2]); const nodeCount = nodeCounts[row[1]];
          if (!integer(row[0], 1) || elements.has(Number(row[0])) || !integer(row[2]) || !nodeCount || row.length !== 3 + tags + nodeCount || row.slice(3).some((v) => !integer(v)) || row.slice(3 + tags).some((v) => !nodes.has(Number(v)))) invalid("неверный двумерный элемент MSH или ссылка на отсутствующий узел");
          elements.add(Number(row[0]));
        }
        await end("Elements");
      } else if (line === "$NodeData" || line === "$ElementData") {
        const section = line.slice(1); const stringTags = await count(0, 32);
        for (let i = 0; i < stringTags; i++) { try { if (typeof JSON.parse(await required()) !== "string") invalid("неверная строковая метка MSH"); } catch { invalid("неверная строковая метка MSH"); } }
        const realTags = await count(0, 32); for (let i = 0; i < realTags; i++) if (!numeric(await required())) invalid("неверная числовая метка MSH");
        const intTags = await count(3, 32); const tags: number[] = []; for (let i = 0; i < intTags; i++) tags.push(await count());
        const components = tags[1]; const entries = tags[2]; const validIds = section === "NodeData" ? nodes : elements; const fieldIds = new Set<number>();
        if (![1, 3, 9].includes(components)) invalid("неподдерживаемое число компонент данных MSH");
        for (let i = 0; i < entries; i++) { const row = (await required()).split(/\s+/); const id = Number(row[0]); if (row.length !== 1 + components || !integer(row[0], 1) || !validIds.has(id) || fieldIds.has(id) || row.slice(1).some((v) => !numeric(v))) invalid("неверные данные узла/элемента MSH"); fieldIds.add(id); }
        await end(section);
      } else invalid(`неподдерживаемый блок MSH: ${line.slice(0, 80)}`);
    }
  } finally { await lines.return?.(); }
  if (!["$MeshFormat", "$Nodes", "$Elements"].every((section) => seen.has(section))) invalid("MSH не содержит всех обязательных блоков");
  if (role === "seabed_msh" && (!model || !schema)) invalid("модель дна должна иметь маркеры lito-seabed/v1 и model_kind=seabed");
}
