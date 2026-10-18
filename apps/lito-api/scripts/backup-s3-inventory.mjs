import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, lstat, open, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { verifyManifest } from "../../../scripts/backup-manifest.mjs";

const inventoryName = "objects.ndjson";
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

async function backupDirectory(directory) {
  const path = resolve(directory);
  if (!(await lstat(path)).isDirectory())
    throw new Error("Каталог backup должен быть обычной директорией");
  return path;
}

async function* listObjects(client, bucket, prefix) {
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    for (const item of page.Contents ?? []) {
      if (typeof item.Key !== "string" || !Number.isSafeInteger(item.Size) || item.Size < 0)
        throw new Error("S3 вернул некорректный объект");
      yield { key: item.Key, size: item.Size };
    }
    if (page.IsTruncated && !page.NextContinuationToken)
      throw new Error("S3 не вернул токен следующей страницы");
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

export async function captureInventory(directory, sourceBucket, client) {
  if (!bucketPattern.test(sourceBucket)) throw new Error("Некорректное имя исходного bucket");
  const path = await backupDirectory(directory);
  const temporary = join(path, `.objects-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  let count = 0;
  let bytes = 0;
  try {
    await file.write(`${JSON.stringify({ schemaVersion: 1, sourceBucket })}\n`);
    for await (const object of listObjects(client, sourceBucket, undefined)) {
      await file.write(`${JSON.stringify(object)}\n`);
      count++;
      bytes += object.size;
    }
    await file.sync();
    await link(temporary, join(path, inventoryName));
  } finally {
    await file.close();
    await unlink(temporary);
  }
  return { count, bytes };
}

export async function verifyCopiedInventory(directory, client, maxAgeHours = 30, now = new Date()) {
  const manifest = await verifyManifest(directory, maxAgeHours, now);
  const snapshot = new URL(manifest.s3SnapshotUri);
  const prefix = snapshot.pathname.slice(1);
  const iterator = listObjects(client, snapshot.hostname, prefix)[Symbol.asyncIterator]();
  const lines = createInterface({ input: createReadStream(join(resolve(directory), inventoryName)), crlfDelay: Infinity });
  let header = false;
  let count = 0;
  let bytes = 0;
  try {
    for await (const line of lines) {
      const entry = JSON.parse(line);
      if (!header) {
        if (entry?.schemaVersion !== 1 || !bucketPattern.test(entry.sourceBucket))
          throw new Error("Неверный заголовок перечня объектов");
        header = true;
        continue;
      }
      if (typeof entry?.key !== "string" || !Number.isSafeInteger(entry.size) || entry.size < 0)
        throw new Error("Неверная запись перечня объектов");
      const remote = await iterator.next();
      if (remote.done || remote.value.key !== `${prefix}${entry.key}` || remote.value.size !== entry.size)
        throw new Error("S3-копия не совпадает с перечнем объектов (ключ или размер)");
      count++;
      bytes += entry.size;
    }
    if (!header) throw new Error("Пустой перечень объектов");
    if (!(await iterator.next()).done)
      throw new Error("В S3-копии есть лишние объекты");
  } finally {
    lines.close();
    await iterator.return?.();
  }
  return { count, bytes };
}

function s3Client() {
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  if (endpoint) {
    const url = new URL(endpoint);
    if (process.env.BACKUP_S3_LOCAL !== "true" || url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/")
      throw new Error("BACKUP_S3_ENDPOINT допускается только для локального smoke-теста");
  }
  return new S3Client({
    region: process.env.AWS_REGION ?? "eu-central-1",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory, value] = process.argv.slice(2);
  let client;
  try {
    if (!directory || !["capture", "verify"].includes(command))
      throw new Error("Использование: capture DIR SOURCE_BUCKET | verify DIR [MAX_AGE_HOURS]");
    client = s3Client();
    const result = command === "capture"
      ? await captureInventory(directory, value, client)
      : await verifyCopiedInventory(directory, client, value === undefined ? 30 : Number(value));
    console.log(`S3 snapshot: ${result.count} объектов, ${result.bytes} байт; проверка завершена`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    client?.destroy();
  }
}
