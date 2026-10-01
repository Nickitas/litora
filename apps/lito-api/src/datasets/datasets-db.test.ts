import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationsRepository } from "../calculations/calculations.repository.js";
import { DatasetsRepository } from "./datasets.repository.js";
import { validateDataset } from "./validation.js";

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
    const storage = {
      bucket: "test-private",
      async uploadBytes(key: string, bytes: Buffer) {
        objects.set(key, bytes);
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
      assert.equal(job.inputSchemaVersion, 1);
      assert.equal(job.resultSchemaVersion, null);
      assert.equal(job.methodId, null);
      assert.equal(job.methodRevision, null);
      assert.deepEqual(job.input, { datasetId: saved.id });
      const linked = await db.query<{ dataset_id: string }>(
        "SELECT dataset_id FROM calculation_jobs WHERE id=$1",
        [job.id],
      );
      assert.equal(linked.rows[0].dataset_id, saved.id);
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
