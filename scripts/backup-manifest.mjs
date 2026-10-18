import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const fileNames = ["litora.dump", "artifacts.csv", "objects.ndjson"];
const manifestName = "backup-manifest.json";
const schemaVersion = 2;
const maxManifestBytes = 64 * 1024;

async function backupDirectory(directory) {
  const path = resolve(directory);
  if (!(await lstat(path)).isDirectory())
    throw new Error("Каталог backup должен быть обычной директорией (symlink запрещён)");
  return path;
}

function snapshotUri(uri) {
  if (
    typeof uri !== "string" ||
    !/^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/snapshots\/[A-Za-z0-9_-]+\/objects\/$/.test(uri)
  ) {
    throw new Error("Ожидается уникальный S3 URI вида s3://bucket/snapshots/ID/objects/");
  }
  return uri;
}

async function fingerprint(directory, name) {
  const path = join(resolve(directory), name);
  const info = await lstat(path);
  if (!info.isFile() || info.size === 0)
    throw new Error(`${name}: нужен непустой обычный файл (symlink запрещён)`);
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  if (bytes !== info.size) throw new Error(`${name}: файл изменился во время проверки`);
  return { bytes, sha256: hash.digest("hex") };
}

export async function createManifest(directory, s3SnapshotUri, now = new Date()) {
  snapshotUri(s3SnapshotUri);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("Недопустимая дата snapshot");
  const path = await backupDirectory(directory);
  const files = Object.fromEntries(
    await Promise.all(fileNames.map(async (name) => [name, await fingerprint(path, name)])),
  );
  const manifest = {
    schemaVersion,
    createdAt: now.toISOString(),
    s3SnapshotUri,
    files,
  };
  await writeFile(join(path, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return manifest;
}

export async function verifyManifest(directory, maxAgeHours = 30, now = new Date()) {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 8760)
    throw new Error("maxAgeHours должен быть в диапазоне (0, 8760]");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error("Недопустимая дата проверки");
  const backupPath = await backupDirectory(directory);
  const path = join(backupPath, manifestName);
  const info = await lstat(path);
  if (!info.isFile() || info.size === 0 || info.size > maxManifestBytes)
    throw new Error("Манифест должен быть непустым обычным файлом до 64 КиБ");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest?.schemaVersion !== schemaVersion) throw new Error("Неизвестная версия манифеста");
  snapshotUri(manifest.s3SnapshotUri);
  const created = Date.parse(manifest.createdAt);
  if (!Number.isFinite(created)) throw new Error("Некорректная дата snapshot");
  const age = now.getTime() - created;
  if (age < -5 * 60_000) throw new Error("Дата snapshot находится в будущем");
  if (age > maxAgeHours * 3_600_000) throw new Error("Резервная копия устарела");
  if (!manifest.files || Object.keys(manifest.files).sort().join(",") !== [...fileNames].sort().join(","))
    throw new Error("Неполный список файлов в манифесте");
  for (const name of fileNames) {
    const expected = manifest.files[name];
    if (!Number.isSafeInteger(expected?.bytes) || expected.bytes <= 0 ||
      !/^[0-9a-f]{64}$/.test(expected.sha256))
      throw new Error(`${name}: некорректная запись манифеста`);
    const actual = await fingerprint(backupPath, name);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256)
      throw new Error(`${name}: размер или SHA-256 не совпадает`);
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory, value] = process.argv.slice(2);
  try {
    if (command === "create" && directory && value && process.argv.length === 5) {
      await createManifest(directory, value);
      console.log("Манифест резервной копии создан");
    } else if (command === "verify" && directory && process.argv.length <= 5) {
      await verifyManifest(directory, value === undefined ? 30 : Number(value));
      console.log("Локальные файлы резервной копии целы и свежи");
    } else {
      throw new Error("Использование: create DIR s3://bucket/snapshots/ID/objects/ | verify DIR [MAX_AGE_HOURS]");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
