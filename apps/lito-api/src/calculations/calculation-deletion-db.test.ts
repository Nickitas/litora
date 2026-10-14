import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationDeletionService } from "./calculation-deletion.service.js";

const url = process.env.TEST_DATABASE_URL;

test("PostgreSQL: удаление ограничено владельцем, зависимостями и подтверждённым снимком", { skip: !url }, async () => {
  assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/);
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  const db = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(db, "pool", { value: pool });
  const objects = new Set<string>();
  let failOnce = true;
  const storage = {
    bucket: "test",
    async *listObjects(prefix: string) {
      for (const key of [...objects]) if (key.startsWith(prefix))
        yield { key, lastModified: undefined, etag: undefined };
    },
    async deleteObject(key: string) {
      if (failOnce) { failOnce = false; throw new Error("S3 недоступен"); }
      objects.delete(key);
    },
  } as unknown as ObjectStorageService;
  const deletion = new CalculationDeletionService(db, storage);
  const users: string[] = [];
  const jobs: string[] = [];
  try {
    await db.initialize();
    for (let index = 0; index < 2; index++) {
      const user = await db.query<{ id: string }>(
        "INSERT INTO users(email,password_hash,display_name) VALUES($1,'test-only','Тест удаления') RETURNING id",
        [`${randomUUID()}@example.test`],
      );
      users.push(user.rows[0].id);
    }
    for (const [owner, status] of [[users[0], "succeeded"], [users[0], "succeeded"], [users[0], "queued"], [users[1], "succeeded"]] as const) {
      const job = await db.query<{ id: string }>(
        "INSERT INTO calculation_jobs(user_id,kind,status) VALUES($1,'map',$2) RETURNING id",
        [owner, status],
      );
      jobs.push(job.rows[0].id);
    }
    await db.query(
      "INSERT INTO calculation_job_dependencies(dependent_job_id,source_job_id) VALUES($1,$2)",
      [jobs[1], jobs[0]],
    );
    const key = `users/${jobs[1]}/result.json`;
    objects.add(key);
    await db.query(
      `INSERT INTO calculation_artifacts(job_id,bucket,object_key,filename,size_bytes,sha256)
       VALUES($1,'test',$2,'result.json',1,$3)`,
      [jobs[1], key, "a".repeat(64)],
    );
    await assert.rejects(deletion.requestSingle(users[0], jobs[3]), { status: 404 });
    await assert.rejects(deletion.requestSingle(users[0], jobs[2]), { status: 409 });
    await assert.rejects(deletion.requestSingle(users[0], jobs[0]), { status: 409 });
    await assert.rejects(deletion.requestAll(users[0]), { status: 409 });
    await db.query("UPDATE calculation_jobs SET status='cancelled' WHERE id=$1", [jobs[2]]);
    const request = await deletion.requestAll(users[0]);
    assert.equal(request.requestedCount, 3);
    await assert.rejects(deletion.getRequest(users[1], request.id), { status: 404 });
    let failedItem: { request_id: string; job_id: string; lock_token: string; attempts: number } | undefined;
    for (let index = 0; index < 4; index++) {
      const item = await deletion.claim();
      if (!item) break;
      await deletion.process(item);
      const state = await deletion.getRequest(users[0], request.id);
      if (state.retryingCount) { failedItem = item; break; }
    }
    assert.ok(failedItem, "сбой S3 должен оставить item для повтора");
    const retained = await db.query("SELECT 1 FROM calculation_jobs WHERE id=$1", [failedItem.job_id]);
    assert.equal(retained.rowCount, 1);
    await db.query(
      "UPDATE calculation_deletion_items SET next_attempt_at=now() WHERE request_id=$1 AND job_id=$2",
      [request.id, failedItem.job_id],
    );
    for (let index = 0; index < 5; index++) {
      const item = await deletion.claim();
      if (!item) break;
      await deletion.process(item);
    }
    const completed = await deletion.getRequest(users[0], request.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.deletedCount, 3);
    assert.equal(objects.size, 0);
    const foreign = await db.query("SELECT 1 FROM calculation_jobs WHERE id=$1", [jobs[3]]);
    assert.equal(foreign.rowCount, 1);
  } finally {
    await db.query("DELETE FROM calculation_job_dependencies WHERE dependent_job_id = ANY($1::uuid[])", [jobs]);
    await db.query("DELETE FROM calculation_jobs WHERE id = ANY($1::uuid[])", [jobs]);
    await db.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [users]);
    await pool.end();
  }
});
