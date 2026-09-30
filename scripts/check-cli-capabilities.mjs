import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cobraDirectory = join(root, "apps/lito-cli/internal/cli/cobra");
const registryPath = join(root, "sdd/cli-capabilities.md");

const sources = readdirSync(cobraDirectory)
  .filter((name) => name.endsWith(".go") && !name.endsWith("_test.go"))
  .map((name) => readFileSync(join(cobraDirectory, name), "utf8"));

const definitions = new Map();
const registrations = new Map();
const flags = new Map();

for (const source of sources) {
  for (const match of source.matchAll(/\bvar\s+(\w+)\s*=\s*&cobra\.Command\s*\{\s*Use:\s*"([^"]+)"/g)) {
    assert.ok(!definitions.has(match[1]), `Повторное определение команды ${match[1]}`);
    definitions.set(match[1], match[2].split(/\s+/)[0]);
  }
  for (const match of source.matchAll(/\b(\w+)\.AddCommand\(\s*(\w+)\s*\)/g)) {
    const children = registrations.get(match[1]) ?? [];
    children.push(match[2]);
    registrations.set(match[1], children);
  }
  for (const match of source.matchAll(/\b(\w+)\.Flags\(\)\.\w+Var(?:P)?\([^\n]*?"([a-z][a-z0-9-]+)"/g)) {
    const names = flags.get(match[1]) ?? new Set();
    names.add(match[2]);
    flags.set(match[1], names);
  }
}

assert.equal(definitions.get("rootCmd"), "lito", "Не найден корень Cobra lito");
const commands = new Map();
const visited = new Set(["rootCmd"]);
function visit(parent, path) {
  for (const child of registrations.get(parent) ?? []) {
    assert.ok(definitions.has(child), `Зарегистрирована неопределённая команда ${child}`);
    assert.ok(!visited.has(child), `Повторная регистрация или цикл: ${child}`);
    visited.add(child);
    const commandPath = `${path} ${definitions.get(child)}`;
    assert.ok(!commands.has(commandPath), `Повторное имя команды: ${commandPath}`);
    commands.set(commandPath, { variable: child, flags: flags.get(child) ?? new Set() });
    visit(child, commandPath);
  }
}
visit("rootCmd", "lito");
assert.equal(visited.size, definitions.size, "Найдены команды Cobra, не подключённые к корню");

const registry = readFileSync(registryPath, "utf8");
const section = registry.match(/^## Реестр\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
assert.ok(section, "В реестре нет раздела «Реестр»");
const documented = new Set();
for (const line of section.split("\n")) {
  if (!line.startsWith("| `lito ")) continue;
  const columns = line.split("|").slice(1, -1).map((value) => value.trim());
  assert.equal(columns.length, 6, `Неверное количество колонок: ${line}`);
  assert.ok(columns.every(Boolean), `Пустая колонка: ${line}`);
  const commandPath = columns[0].match(/^`(lito(?: [a-z][a-z0-9-]*)+)`$/)?.[1];
  assert.ok(commandPath, `Неверный путь команды: ${columns[0]}`);
  assert.ok(!documented.has(commandPath), `Дубликат в реестре: ${commandPath}`);
  documented.add(commandPath);
  const command = commands.get(commandPath);
  assert.ok(command, `В реестре указана несуществующая команда: ${commandPath}`);
  for (const flag of columns[1].matchAll(/--([a-z][a-z0-9-]*)/g)) {
    assert.ok(command.flags.has(flag[1]), `${commandPath}: флаг --${flag[1]} не объявлен локально`);
  }
}

const missing = [...commands.keys()].filter((path) => !documented.has(path));
assert.deepEqual(missing, [], `Новые CLI-команды без решения в ${registryPath}`);
console.log(`CLI: ${documented.size} зарегистрированных команд описаны в SDD-реестре — OK.`);
