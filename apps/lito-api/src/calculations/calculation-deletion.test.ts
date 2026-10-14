import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationDeletionService } from "./calculation-deletion.service.js";

const jobId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";
const item = { job_id: jobId, request_id: requestId, lock_token: token, attempts: 1 };

test("worker удаляет объекты до metadata и завершает операцию в транзакции", async () => {
  const key = `users/${jobId}/report.json`;
  const objects = new Set([key]);
  const order: string[] = [];
  const db = {
    query: async (sql: string) => {
      if (sql.startsWith("SELECT bucket,object_key"))
        return { rows: [{ bucket: "test", object_key: key }] };
      throw new Error(`Неожиданный запрос: ${sql}`);
    },
    transaction: async (operation: (client: { query: (sql: string) => Promise<{ rowCount: number }> }) => Promise<void>) => {
      order.push("transaction");
      await operation({ query: async (sql) => {
        if (sql.startsWith("SELECT 1 FROM calculation_deletion_items")) return { rowCount: 1 };
        if (sql.startsWith("DELETE FROM calculation_jobs")) {
          order.push("delete_job");
          return { rowCount: 1 };
        }
        return { rowCount: 1 };
      } });
    },
  } as unknown as DatabaseService;
  const storage = {
    bucket: "test",
    async *listObjects(prefix: string) {
      for (const objectKey of [...objects]) if (objectKey.startsWith(prefix))
        yield { key: objectKey, lastModified: undefined, etag: undefined };
    },
    async deleteObject(objectKey: string) {
      order.push("delete_s3");
      objects.delete(objectKey);
    },
  } as unknown as ObjectStorageService;
  await new CalculationDeletionService(db, storage).process(item);
  assert.deepEqual(order, ["delete_s3", "transaction", "delete_job"]);
  assert.equal(objects.size, 0);
});

test("ошибка S3 оставляет metadata и переносит попытку", async () => {
  const key = `users/${jobId}/report.json`;
  let retried = false;
  const db = {
    query: async (sql: string) => {
      if (sql.startsWith("SELECT bucket,object_key"))
        return { rows: [{ bucket: "test", object_key: key }] };
      if (sql.startsWith("UPDATE calculation_deletion_items SET status='pending'")) {
        retried = true;
        return { rows: [] };
      }
      throw new Error(`Неожиданный запрос: ${sql}`);
    },
    transaction: async () => { throw new Error("Metadata не должны удаляться"); },
  } as unknown as DatabaseService;
  const storage = {
    bucket: "test",
    async *listObjects() { yield { key, lastModified: undefined, etag: undefined }; },
    async deleteObject() { throw new Error("S3 недоступен"); },
  } as unknown as ObjectStorageService;
  await new CalculationDeletionService(db, storage).process(item);
  assert.equal(retried, true);
});
