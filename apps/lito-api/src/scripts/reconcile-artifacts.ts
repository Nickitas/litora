import { parseArgs } from "node:util";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import {
  applyCleanupCandidate,
  cleanupCandidate,
  jobIdFromArtifactKey,
  possiblyMissingObject,
  type ListedArtifact,
  type ReferencedArtifact,
  type ReconciliationJob,
} from "../worker/artifact-reconciliation.js";

const maxScannedObjects = 10_000;
const maxScannedMetadata = 10_000;
const maxMissingHeadsPerRun = 100;
const maxDeletesPerRun = 100;
const { values } = parseArgs({
  args: process.argv.slice(2).filter((value) => value !== "--"),
  options: {
    apply: { type: "boolean", default: false },
    "older-than-hours": { type: "string", default: "24" },
  },
});
const hours = Number(values["older-than-hours"]);
if (!Number.isInteger(hours) || hours < 24 || hours > 8760)
  throw new Error("Порог сверки должен быть целым числом от 24 до 8760 часов");

async function main(): Promise<void> {
  const db = new DatabaseService();
  const storage = new ObjectStorageService();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  try {
    // Даже dry-run не должен создавать bucket или менять схему БД.
    await storage.check();
    const objects: ListedArtifact[] = [];
    for await (const object of storage.listObjects("users/")) {
      if (objects.length === maxScannedObjects)
        throw new Error(`Сверка остановлена: более ${maxScannedObjects} объектов`);
      objects.push(object);
    }
    const ids = [
      ...new Set(
        objects
          .map((object) => jobIdFromArtifactKey(object.key))
          .filter((id): id is string => id !== null),
      ),
    ];
    const jobs = new Map<string, ReconciliationJob>();
    if (ids.length) {
      const rows = await db.query<ReconciliationJob>(
        "SELECT id::text AS id,status,finished_at FROM calculation_jobs WHERE id=ANY($1::uuid[])",
        [ids],
      );
      for (const row of rows.rows) jobs.set(row.id, row);
    }
    const listedKeys = new Set(objects.map((object) => object.key));
    const artifactRows = await db.query<ReferencedArtifact>(
      `SELECT a.object_key, a.job_id::text AS job_id, a.created_at,
              j.status, j.finished_at
         FROM calculation_artifacts a
         JOIN calculation_jobs j ON j.id = a.job_id
        WHERE a.bucket = $1 AND a.object_key LIKE 'users/%'
        ORDER BY a.object_key
        LIMIT $2`,
      [storage.bucket, maxScannedMetadata + 1],
    );
    if (artifactRows.rows.length > maxScannedMetadata)
      throw new Error(`Сверка остановлена: более ${maxScannedMetadata} записей артефактов`);
    const metadata = new Map<string, string>();
    for (const row of artifactRows.rows)
      metadata.set(row.object_key, row.job_id);
    const possiblyMissing = artifactRows.rows.filter((row) =>
      possiblyMissingObject(row, listedKeys, cutoff),
    );
    const missingS3: string[] = [];
    for (const row of possiblyMissing.slice(0, maxMissingHeadsPerRun)) {
      if (!(await storage.headObject(row.object_key)))
        missingS3.push(row.object_key);
    }
    const candidates = objects
      .map((object) => {
        const jobId = jobIdFromArtifactKey(object.key);
        const owner = metadata.get(object.key);
        if (owner && owner !== jobId) return null;
        return cleanupCandidate(
          object,
          jobs.get(jobId ?? ""),
          Boolean(owner),
          cutoff,
        );
      })
      .filter((candidate) => candidate !== null)
      .sort((a, b) => a.lastModified!.getTime() - b.lastModified!.getTime());
    console.log(
      JSON.stringify({
        mode: values.apply ? "apply" : "dry-run",
        scanned: objects.length,
        candidates: candidates.length,
        metadataScanned: artifactRows.rows.length,
        missingS3: missingS3.length,
        missingS3Unchecked: Math.max(0, possiblyMissing.length - maxMissingHeadsPerRun),
        cutoff: cutoff.toISOString(),
        sample: candidates
          .slice(0, 20)
          .map(({ key, hasMetadata }) => ({ key, hasMetadata })),
        missingS3Sample: missingS3.slice(0, 20),
      }),
    );
    if (!values.apply) return;
    let deleted = 0;
    let skipped = 0;
    for (const candidate of candidates.slice(0, maxDeletesPerRun)) {
      const applied = await applyCleanupCandidate(candidate, cutoff, {
        getJob: async () => {
          const result = await db.query<ReconciliationJob>(
            "SELECT id::text AS id,status,finished_at FROM calculation_jobs WHERE id=$1",
            [candidate.jobId],
          );
          return result.rows[0];
        },
        getMetadataOwner: async () => {
          const result = await db.query<{ job_id: string }>(
            "SELECT job_id::text AS job_id FROM calculation_artifacts WHERE bucket=$1 AND object_key=$2",
            [storage.bucket, candidate.key],
          );
          return result.rows[0]?.job_id;
        },
        headObject: () => storage.headObject(candidate.key),
        deleteObject: () => storage.deleteObject(candidate.key),
        removeMetadata: async () => {
          await db.query(
            "DELETE FROM calculation_artifacts WHERE job_id=$1 AND bucket=$2 AND object_key=$3",
            [candidate.jobId, storage.bucket, candidate.key],
          );
        },
      });
      if (applied) deleted++;
      else skipped++;
    }
    console.log(
      JSON.stringify({
        deleted,
        skipped,
        deferred: Math.max(0, candidates.length - maxDeletesPerRun),
      }),
    );
  } finally {
    await db.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Сверка артефактов не удалась",
  );
  process.exitCode = 1;
});
