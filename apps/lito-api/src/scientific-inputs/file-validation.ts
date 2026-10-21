import { BadRequestException } from "@nestjs/common";
import { readFile, stat } from "node:fs/promises";
import type { ScientificInputRole } from "@litora/contracts";
import { scientificInputFormat } from "./format-catalog.js";
import { validateMSHFile, validateTableFile } from "./text-formats.js";
import { validateScientificJSON } from "./json-formats.js";
export { validateScientificJSON } from "./json-formats.js";

// Ограничиваем суммарную память параллельных проверок: в один момент обрабатывается
// один научный файл, JSON ограничен 64 МиБ, MSH/таблицы читаются потоком.
let validationTail: Promise<void> = Promise.resolve();

export async function validateScientificFile(path: string, role: ScientificInputRole, filename: string): Promise<void> {
  const previous = validationTail;
  let release!: () => void;
  validationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const format = scientificInputFormat(role);
    const info = await stat(path);
    if (!info.isFile() || info.size < 1 || info.size > format.maxBytes)
      throw new BadRequestException("Размер научного файла не соответствует пределу выбранного формата");
    if (format.format === "msh2") return await validateMSHFile(path, role);
    if (format.format === "csv" || format.format === "tsv" || (role === "wave_climate" && filename.toLowerCase().endsWith(".csv")))
      return await validateTableFile(path, role);
    const bytes = await readFile(path);
    let value: unknown;
    try {
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("BOM");
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { throw new BadRequestException("Требуется корректный JSON в UTF-8 без BOM"); }
    validateScientificJSON(role, value);
  } finally { release(); }
}
