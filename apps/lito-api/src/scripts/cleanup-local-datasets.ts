import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { environment } from "../config/environment.js";
import type { DatasetRow } from "../datasets/datasets.repository.js";

const { values } = parseArgs({
  options: {
    owner: { type: "string" },
    name: { type: "string" },
    sha256: { type: "string" },
    count: { type: "string" },
    "plan-hash": { type: "string" },
    apply: { type: "boolean", default: false },
  },
});

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const owner = values.owner ?? "";
const expectedName = values.name ?? "";
const expectedSha256 = values.sha256 ?? "";
const expectedCount = Number(values.count);
if (
  !uuidPattern.test(owner) ||
  !expectedName ||
  !/^[0-9a-f]{64}$/.test(expectedSha256) ||
  !Number.isInteger(expectedCount) ||
  expectedCount < 1 ||
  expectedCount > 100
)
  throw new Error(
    "Укажите --owner UUID, --name, --sha256 и --count от 1 до 100",
  );
if (values.apply && !/^[0-9a-f]{64}$/.test(values["plan-hash"] ?? ""))
  throw new Error(
    "Для --apply требуется --plan-hash из предварительной проверки",
  );

// Этот инструмент предназначен только для явной очистки локального dev-окружения.
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (
  process.env.NODE_ENV === "production" ||
  !localHosts.has(new URL(environment.databaseUrl).hostname) ||
  !localHosts.has(new URL(environment.s3.endpoint).hostname)
)
  throw new Error("Очистка разрешена только для локальных PostgreSQL и S3");

function planHash(rows: DatasetRow[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function oldestDataset(rows: DatasetRow[]): DatasetRow {
  return [...rows].sort(
    (left, right) =>
      left.created_at.getTime() - right.created_at.getTime() ||
      left.id.localeCompare(right.id),
  )[0];
}

function assertTargets(rows: DatasetRow[]): void {
  const passport = (row: DatasetRow) =>
    JSON.stringify([
      row.schema_version,
      row.name,
      row.source,
      row.source_revision,
      row.license,
      row.crs,
      row.coordinate_unit,
      row.point_count,
      row.size_bytes,
      row.sha256,
    ]);
  if (
    rows.length !== expectedCount ||
    rows.some(
      (row) =>
        row.owner_id !== owner ||
        row.name !== expectedName ||
        row.sha256 !== expectedSha256 ||
        row.object_key !== `users/${owner}/datasets/${row.id}.geojson` ||
        passport(row) !== passport(rows[0]),
    )
  )
    throw new Error(
      "Состав или паспорт наборов изменился; выполните новую проверку",
    );
}

async function linkedJobCount(
  db: DatabaseService,
  ids: string[],
): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM calculation_jobs
     WHERE dataset_id=ANY($1::uuid[]) OR input->>'datasetId'=ANY($2::text[])`,
    [ids, ids],
  );
  return Number(result.rows[0].count);
}

async function main(): Promise<void> {
  const db = new DatabaseService();
  const storage = new ObjectStorageService();
  try {
    await storage.check();
    const result = await db.query<DatasetRow>(
      "SELECT * FROM datasets WHERE owner_id=$1 ORDER BY id",
      [owner],
    );
    const rows = result.rows;
    assertTargets(rows);
    const retained = oldestDataset(rows);
    const duplicates = rows.filter((row) => row.id !== retained.id);
    if (duplicates.length === 0)
      throw new Error("Повторов нет: единственную запись удалять нельзя");
    const ids = duplicates.map((row) => row.id);
    const links = await linkedJobCount(db, ids);
    if (links !== 0)
      throw new Error(
        `Удаление запрещено: наборы используются в ${links} расчётах`,
      );
    const contents = new Map<string, Buffer>();
    for (const row of rows) {
      const bytes = await storage.readObjectBytes(row.object_key, 65_536);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (bytes.length !== row.size_bytes || digest !== row.sha256)
        throw new Error(
          "Байты S3 не совпадают с паспортом набора; очистка остановлена",
        );
      contents.set(row.id, bytes);
    }
    const hash = planHash(rows);
    console.log(
      JSON.stringify({
        mode: values.apply ? "apply" : "dry-run",
        duplicateRecords: duplicates.length,
        retainedDataset: retained.id,
        linkedJobs: links,
        verifiedObjects: contents.size,
        planHash: hash,
      }),
    );
    if (!values.apply) return;
    if (values["plan-hash"] !== hash)
      throw new Error("План изменился; повторите предварительную проверку");

    const backupRoot = resolve(process.cwd(), "../../.litora/backups");
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const backup = await mkdtemp(join(backupRoot, "dataset-cleanup-"));
    for (const row of duplicates)
      await writeFile(
        join(backup, `${row.id}.geojson`),
        contents.get(row.id)!,
        { mode: 0o600 },
      );
    await writeFile(
      join(backup, "manifest.json"),
      JSON.stringify(
        {
          owner,
          planHash: hash,
          bucket: storage.bucket,
          retainedDataset: retained.id,
          deletedRows: duplicates,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ backup }));

    await db.transaction(async (client) => {
      const user = await client.query(
        "SELECT id FROM users WHERE id=$1 FOR UPDATE",
        [owner],
      );
      if (!user.rowCount) throw new Error("Владелец не найден");
      const current = await client.query<DatasetRow>(
        "SELECT * FROM datasets WHERE owner_id=$1 ORDER BY id FOR UPDATE",
        [owner],
      );
      assertTargets(current.rows);
      if (planHash(current.rows) !== hash)
        throw new Error("План изменился после резервного копирования");
      const references = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM calculation_jobs
         WHERE dataset_id=ANY($1::uuid[]) OR input->>'datasetId'=ANY($2::text[])`,
        [ids, ids],
      );
      if (Number(references.rows[0].count) !== 0)
        throw new Error("Появился зависимый расчёт; удаление остановлено");
      const deleted = await client.query(
        "DELETE FROM datasets WHERE owner_id=$1 AND id=ANY($2::uuid[]) RETURNING id",
        [owner, ids],
      );
      if (deleted.rowCount !== duplicates.length)
        throw new Error("Удалены не все ожидаемые записи; транзакция отменена");
    });

    let deletedObjects = 0;
    for (const row of duplicates) {
      await storage.deleteObject(row.object_key);
      if (await storage.headObject(row.object_key))
        throw new Error(
          "S3 всё ещё возвращает удалённый объект; проверьте резервную копию",
        );
      deletedObjects++;
    }
    console.log(
      JSON.stringify({
        deletedRecords: duplicates.length,
        deletedObjects,
        retainedDataset: retained.id,
        backup,
      }),
    );
  } finally {
    await db.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Очистка завершилась ошибкой",
  );
  process.exitCode = 1;
});
