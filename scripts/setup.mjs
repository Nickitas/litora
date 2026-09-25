import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const target = new URL(".env.local", root);
try {
  await readFile(target);
  console.log(".env.local уже существует, настройки сохранены.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const password = randomBytes(24).toString("hex");
  const s3Secret = randomBytes(24).toString("hex");
  const example = await readFile(new URL(".env.example", root), "utf8");
  const configured = example
    .replaceAll("litora_local_password", password)
    .replace(`S3_SECRET_KEY=${password}`, `S3_SECRET_KEY=${s3Secret}`);
  await writeFile(target, configured, { mode: 0o600, flag: "wx" });
  console.log(`Создан ${fileURLToPath(target)} с локальными паролями.`);
}
