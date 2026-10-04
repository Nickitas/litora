import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const routes = readFileSync(join(root, "src/app/routes.ts"), "utf8");
const entry = readFileSync(join(root, "src/main.tsx"), "utf8");
assert.match(routes, /path: "\/docs"/);
assert.match(routes, /path: "\/downloads"/);
assert.match(routes, /path: "\/docs\/reference\/:slug"/);
assert.match(entry, /errorElement: <RouteError \/>/, "Нет общего экрана ошибок маршрутов");

const docsDir = join(root, "../../packages/docs/content");
assert.ok(
  readdirSync(docsDir, { recursive: true }).filter((file) => file.endsWith(".md"))
    .length >= 20,
  "В общем пакете не найдены документы сайта"
);
assert.ok(!existsSync(join(docsDir, "sdd")), "SDD не должна публиковаться на сайте");

const manifest = JSON.parse(readFileSync(join(root, "src/shared/config/releases.json"), "utf8"));
assert.match(manifest.version, /^v\d+\.\d+(?:\.\d+)?$/);
assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
const expectedMagic = {
  linux: "7f454c46",
  macos: "cffaedfe",
  windows: "4d5a",
};
for (const file of manifest.files) {
  assert.ok(file.path.startsWith("/downloads/"), `Неверный путь файла: ${file.name}`);
  const artifact = join(root, "public", file.path.slice(1));
  assert.ok(existsSync(artifact) && statSync(artifact).size > 4, `Нет файла: ${file.name}`);
  const handle = openSync(artifact, "r");
  const magic = Buffer.alloc(4);
  try {
    readSync(handle, magic, 0, magic.length, 0);
  } finally {
    closeSync(handle);
  }
  assert.ok(
    magic.toString("hex").startsWith(expectedMagic[file.os]),
    `Неверный формат бинарника или не загружен Git LFS: ${file.name}`
  );
  assert.match(file.sha256, /^[a-f0-9]{64}$/, `Нет SHA-256 для ${file.name}`);
  const actualHash = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  assert.equal(actualHash, file.sha256, `Бинарник изменился: ${file.name}`);
}
console.log("Проверены маршруты, документы общего пакета и бинарники релиза.");
