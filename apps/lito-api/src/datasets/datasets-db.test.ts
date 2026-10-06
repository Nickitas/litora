import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationsRepository } from "../calculations/calculations.repository.js";
import { DatasetsRepository } from "./datasets.repository.js";
import { maxDatasetsPerUser, validateDataset } from "./validation.js";

const url = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL: набор принадлежит владельцу, job хранит UUID и паспорт",
  { skip: !url },
  async () => {
    assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/);
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    const db = Object.create(DatabaseService.prototype) as DatabaseService;
    Object.defineProperty(db, "pool", { value: pool });
    const objects = new Map<string, Buffer>();
    let uploadGate: Promise<void> | undefined;
    let releaseUploads: (() => void) | undefined;
    let concurrentUploads = 0;
    const storage = {
      bucket: "test-private",
      async uploadBytes(key: string, bytes: Buffer) {
        objects.set(key, bytes);
        if (uploadGate) {
          concurrentUploads++;
          if (concurrentUploads === 2) releaseUploads?.();
          await uploadGate;
        }
      },
      async deleteObject(key: string) {
        objects.delete(key);
      },
      async downloadUrl() {
        throw new Error("Входной набор не выдаётся через signed URL");
      },
    } as unknown as ObjectStorageService;
    const datasets = new DatasetsRepository(db, storage);
    const jobs = new CalculationsRepository(db, storage);
    const users: string[] = [];
    try {
      await db.initialize();
      for (let index = 0; index < 2; index++) {
        const result = await db.query<{ id: string }>(
          "INSERT INTO users(email,password_hash,display_name) VALUES($1,'test-only','Тест набора') RETURNING id",
          [`${randomUUID()}@example.test`],
        );
        users.push(result.rows[0].id);
      }
      const { dataset, bytes } = validateDataset({
        name: "Тестовая линия",
        source: "Тестовая съёмка",
        sourceRevision: "съёмка-v2",
        license: "Тестовая лицензия",
        crs: "EPSG:4326",
        coordinateUnit: "degrees",
        geometry: {
          type: "LineString",
          coordinates: [
            [39.67, 43.64],
            [39.68, 43.63],
          ],
        },
      });
      const saved = await datasets.create(users[0], dataset, bytes);
      assert.equal(saved.schemaVersion, 1);
      assert.equal(saved.sourceRevision, "съёмка-v2");
      assert.equal(saved.sizeBytes, bytes.length);
      assert.match(saved.sha256, /^[a-f0-9]{64}$/);
      assert.equal(objects.size, 1);
      assert.equal("objectKey" in saved, false);
      assert.deepEqual(
        (await datasets.list(users[0])).map((item) => item.id),
        [saved.id],
      );
      assert.deepEqual(await datasets.list(users[1]), []);
      await assert.rejects(datasets.getOwned(saved.id, users[1]), {
        status: 404,
      });
      await assert.rejects(
        jobs.create(users[1], {
          kind: "dimension_dataset",
          input: { datasetId: saved.id },
        }),
        { status: 404 },
      );
      const job = await jobs.create(users[0], {
        kind: "dimension_dataset",
        input: { datasetId: saved.id },
      });
      assert.equal(job.kind, "dimension_dataset");
      assert.equal(job.inputSchemaVersion, 3);
      assert.equal(job.resultSchemaVersion, null);
      assert.equal(job.methodId, null);
      assert.equal(job.methodRevision, null);
      assert.deepEqual(job.input, { datasetId: saved.id });
      const linked = await db.query<{ dataset_id: string }>(
        "SELECT dataset_id FROM calculation_jobs WHERE id=$1",
        [job.id],
      );
      assert.equal(linked.rows[0].dataset_id, saved.id);
      await db.query(
        `INSERT INTO datasets(owner_id,name,source,license,crs,coordinate_unit,point_count,size_bytes,sha256,object_key)
         SELECT $1::uuid, 'Квота', 'Тест', 'Тест', 'EPSG:4326', 'degrees', 2, 1,
                repeat('a', 64), 'quota-test/' || ($1::uuid)::text || '/' || n::text
           FROM generate_series(1, $2::integer) AS n`,
        [users[0], maxDatasetsPerUser - 2],
      );
      uploadGate = new Promise<void>((resolve) => { releaseUploads = resolve; });
      const concurrent = await Promise.allSettled([
        datasets.create(users[0], dataset, bytes),
        datasets.create(users[0], dataset, bytes),
      ]);
      assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
      const rejected = concurrent.find((result) => result.status === "rejected");
      assert.equal(rejected?.reason.status, 409);
      const count = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM datasets WHERE owner_id=$1",
        [users[0]],
      );
      assert.equal(Number(count.rows[0].count), maxDatasetsPerUser);
      assert.equal(objects.size, 2, "Отвергнутый конкурентный upload удалён из S3");
      await assert.rejects(datasets.create(users[0], dataset, bytes), { status: 409 });
      assert.equal(objects.size, 2, "Запрос после достижения лимита не пишет в S3");
    } finally {
      if (users.length) {
        await db.query(
          "DELETE FROM calculation_jobs WHERE user_id=ANY($1::uuid[])",
          [users],
        );
        await db.query("DELETE FROM datasets WHERE owner_id=ANY($1::uuid[])", [
          users,
        ]);
        await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
      }
      await db.onModuleDestroy();
    }
  },
);
