import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCleanupCandidate,
  cleanupCandidate,
  jobIdFromArtifactKey,
  possiblyMissingObject,
  type ListedArtifact,
  type ReferencedArtifact,
  type ReconciliationJob,
} from "./artifact-reconciliation.js";

const id = "11111111-1111-4111-8111-111111111111";
const cutoff = new Date("2026-10-01T00:00:00Z");
const old = new Date("2026-09-29T00:00:00Z");
const object: ListedArtifact = {
  key: `users/${id}/report.json`,
  lastModified: old,
  etag: '"abc"',
};
const job: ReconciliationJob = { id, status: "failed", finished_at: old };

test("только старый результат завершённого ошибкой job становится кандидатом", () => {
  assert.deepEqual(cleanupCandidate(object, job, true, cutoff), {
    ...object,
    jobId: id,
    hasMetadata: true,
  });
  assert.equal(jobIdFromArtifactKey(`users/${id}/datasets/input.geojson`), null);
  assert.equal(jobIdFromArtifactKey(`users/${id}/../datasets/input.geojson`), null);
  assert.equal(jobIdFromArtifactKey(`calculations/${id}/report.json`), null);
  assert.equal(jobIdFromArtifactKey(`users/${id}/report.json`), id);
});

test("активные и успешные jobs, свежие файлы и журналы сохраняются", () => {
  for (const status of ["queued", "running", "succeeded"])
    assert.equal(cleanupCandidate(object, { ...job, status }, false, cutoff), null);
  assert.equal(cleanupCandidate(object, undefined, false, cutoff), null);
  assert.equal(cleanupCandidate(object, { ...job, finished_at: null }, false, cutoff), null);
  assert.equal(cleanupCandidate(object, { ...job, finished_at: new Date("2026-10-02") }, false, cutoff), null);
  assert.equal(cleanupCandidate({ ...object, lastModified: new Date("2026-10-02") }, job, false, cutoff), null);
  assert.equal(cleanupCandidate({ ...object, lastModified: undefined }, job, false, cutoff), null);
  assert.equal(cleanupCandidate({ ...object, etag: undefined }, job, false, cutoff), null);
  assert.equal(cleanupCandidate({ ...object, key: `users/${id}/failure.log` }, job, true, cutoff), null);
  assert.equal(cleanupCandidate({ ...object, key: `users/${id}/datasets/input.geojson` }, job, false, cutoff), null);
  assert.equal(cleanupCandidate({ ...object, key: "users/other/report.json" }, job, false, cutoff), null);
  assert.ok(cleanupCandidate(object, { ...job, status: "cancelled" }, false, cutoff));
});

test("пропавший объект отмечается только для старой записи завершённого job", () => {
  const artifact: ReferencedArtifact = {
    object_key: object.key,
    job_id: id,
    created_at: old,
    status: "succeeded",
    finished_at: old,
  };
  assert.equal(possiblyMissingObject(artifact, new Set(), cutoff), true);
  assert.equal(possiblyMissingObject(artifact, new Set([object.key]), cutoff), false);
  for (const status of ["queued", "running"])
    assert.equal(possiblyMissingObject({ ...artifact, status }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, finished_at: null }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, created_at: new Date("2026-10-02") }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, finished_at: new Date("2026-10-02") }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, job_id: "22222222-2222-4222-8222-222222222222" }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, object_key: `users/${id}/datasets/input.geojson` }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, object_key: `calculations/${id}/report.json` }, new Set(), cutoff), false);
  assert.equal(possiblyMissingObject({ ...artifact, status: "failed" }, new Set(), cutoff), true);
  assert.equal(possiblyMissingObject({ ...artifact, status: "cancelled" }, new Set(), cutoff), true);
});

test("apply перепроверяет статус, владельца metadata и версию S3 до удаления", async () => {
  const candidate = cleanupCandidate(object, job, true, cutoff)!;
  const calls: string[] = [];
  const actions = {
    getJob: async () => job,
    getMetadataOwner: async () => id,
    headObject: async () => ({ etag: object.etag, lastModified: object.lastModified }),
    deleteObject: async () => { calls.push("s3"); },
    removeMetadata: async () => { calls.push("db"); },
  };
  assert.equal(await applyCleanupCandidate(candidate, cutoff, actions), true);
  assert.deepEqual(calls, ["s3", "db"]);
  calls.length = 0;
  assert.equal(
    await applyCleanupCandidate(candidate, cutoff, {
      ...actions,
      getJob: async () => ({ ...job, status: "succeeded" }),
    }),
    false,
  );
  assert.equal(
    await applyCleanupCandidate(candidate, cutoff, {
      ...actions,
      getMetadataOwner: async () => "22222222-2222-4222-8222-222222222222",
    }),
    false,
  );
  assert.equal(
    await applyCleanupCandidate(candidate, cutoff, {
      ...actions,
      headObject: async () => ({ etag: '"changed"', lastModified: object.lastModified }),
    }),
    false,
  );
  assert.equal(
    await applyCleanupCandidate(candidate, cutoff, {
      ...actions,
      headObject: async () => ({ etag: object.etag, lastModified: new Date("2026-09-30") }),
    }),
    false,
  );
  assert.equal(
    await applyCleanupCandidate({ ...candidate, jobId: "22222222-2222-4222-8222-222222222222" }, cutoff, actions),
    false,
  );
  assert.deepEqual(calls, []);
});
