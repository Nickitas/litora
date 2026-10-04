import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanupPartialArtifacts } from "./partial-artifacts.js";

const jobId = "11111111-1111-4111-8111-111111111111";

test("частичные результаты удаляются из S3 перед удалением записи БД", async () => {
  const calls: string[] = [];
  const keys = new Set([
    `users/${jobId}/report.json`,
    `users/${jobId}/nested/chart.svg`,
  ]);
  const failed = await cleanupPartialArtifacts(
    jobId,
    keys,
    async (key) => { calls.push(`s3:${key}`); },
    async (id, key) => { calls.push(`db:${id}:${key}`); },
  );
  assert.deepEqual(failed, []);
  assert.deepEqual(calls, [
    `s3:users/${jobId}/report.json`,
    `db:${jobId}:users/${jobId}/report.json`,
    `s3:users/${jobId}/nested/chart.svg`,
    `db:${jobId}:users/${jobId}/nested/chart.svg`,
  ]);
});

test("ошибка S3 оставляет метаданные для последующей сверки", async () => {
  const calls: string[] = [];
  const first = `users/${jobId}/report.json`;
  const second = `users/${jobId}/chart.svg`;
  const failed = await cleanupPartialArtifacts(
    jobId,
    new Set([first, second]),
    async (key) => {
      calls.push(`s3:${key}`);
      if (key === first) throw new Error("S3 недоступен");
    },
    async (_id, key) => { calls.push(`db:${key}`); },
  );
  assert.deepEqual(failed, [first]);
  assert.deepEqual(calls, [`s3:${first}`, `s3:${second}`, `db:${second}`]);
});

test("очистка не принимает ключ другого job или входного dataset", async () => {
  const calls: string[] = [];
  await assert.rejects(
    cleanupPartialArtifacts(
      jobId,
      new Set([`users/${jobId}/report.json`, "users/other/datasets/input.geojson"]),
      async (key) => { calls.push(key); },
      async () => { calls.push("db"); },
    ),
    /ключ вне каталога/,
  );
  assert.deepEqual(calls, []);
});
