import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";

const url = process.env.TEST_DATABASE_URL;

test("PostgreSQL: квота учитывает только свои записи всех состояний", { skip: !url }, async () => {
  assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/);
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  const db = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(db, "pool", { value: pool });
  const repository = new ScientificInputsRepository(db);
  const users: string[] = [];
  try {
    await db.initialize();
    for (let index = 0; index < 2; index++) {
      const row = await db.query<{ id: string }>(
        "INSERT INTO users(email,password_hash,display_name) VALUES($1,'test-only','Тест квоты') RETURNING id",
        [`${randomUUID()}@example.test`],
      );
      users.push(row.rows[0].id);
    }
    const input = (sizeBytes: number) => ({
      name: "Тестовый контур", role: "coastline_geojson" as const,
      filename: "coast.geojson", sizeBytes, source: "Тест",
      license: "Тест", crs: "EPSG:4326", coordinateUnit: "degrees",
    });
    const own = await repository.create(users[0], input(10));
    const foreign = await repository.create(users[1], input(20));
    assert.equal(foreign.status, "pending");
    assert.deepEqual(await repository.quota(users[0]), {
      usedCount: 1, limitCount: 20, usedBytes: 10, limitBytes: 2 * 1024 ** 3,
    });
    assert.deepEqual(await repository.quota(users[1]), {
      usedCount: 1, limitCount: 20, usedBytes: 20, limitBytes: 2 * 1024 ** 3,
    });
    await db.query("UPDATE scientific_inputs SET status='uploading' WHERE id=$1", [own.id]);
    assert.equal((await repository.quota(users[0])).usedBytes, 10);
    await db.query("UPDATE scientific_inputs SET status='ready' WHERE id=$1", [own.id]);
    const pending = await repository.create(users[0], input(5));
    assert.equal((await repository.quota(users[0])).usedBytes, 15);
    assert.equal((await repository.quota(users[0])).usedCount, 2);
    await repository.deletePending(pending.id, users[0]);
    assert.equal((await repository.quota(users[0])).usedBytes, 10);
    assert.equal((await repository.quota(users[1])).usedCount, 1);
    for (let index = 1; index < 20; index++)
      await repository.create(users[0], input(1));
    assert.equal((await repository.quota(users[0])).usedCount, 20);
    await assert.rejects(repository.create(users[0], input(1)), { status: 409 });
  } finally {
    if (users.length) {
      await db.query("DELETE FROM scientific_inputs WHERE owner_id=ANY($1::uuid[])", [users]);
      await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    }
    await db.onModuleDestroy();
  }
});
