import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if ((process.argv.includes("--require-database") || process.env.CI === "true") &&
    !process.env.TEST_DATABASE_URL) {
  throw new Error("Для проверки API с БД задайте TEST_DATABASE_URL выделенной БД litora_test_*");
}
if (process.env.TEST_DATABASE_URL) {
  let database;
  try { database = new URL(process.env.TEST_DATABASE_URL); }
  catch { throw new Error("TEST_DATABASE_URL имеет некорректный формат"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      !database.hostname || !/^\/litora_test_[a-z0-9_]+$/.test(database.pathname)) {
    throw new Error("Тест разрешён только для выделенной PostgreSQL БД litora_test_*");
  }
}

const source = fileURLToPath(new URL("../src/", import.meta.url));

function testsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testsIn(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const tests = testsIn(source).sort();
if (!tests.length) throw new Error("Не найдены тесты API");

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
