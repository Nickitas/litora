import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";

const url = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL: параллельное резервирование каталога, квота и изоляция владельцев",
  { skip: !url },
  async () => {
    assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/);
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    const db = Object.create(DatabaseService.prototype) as DatabaseService;
    Object.defineProperty(db, "pool", { value: pool });
    const repository = new ScientificInputsRepository(db);
    const users: string[] = [];
    const input = {
      name: "Море",
      role: "coastline_geojson" as const,
      filename: "catalogue.geojson",
      sizeBytes: 299701,
      source: "Закреплённый источник",
      sourceRevision: "v1",
      license: "CC-BY",
      crs: "EPSG:4326",
      coordinateUnit: "degrees",
    };
    const digest = "a".repeat(64);
    try {
      await db.initialize();
      for (let index = 0; index < 2; index++) {
        const row = await db.query<{ id: string }>(
          "INSERT INTO users(email,password_hash,display_name) VALUES($1,'test-only','Каталог') RETURNING id",
          [`${randomUUID()}@example.test`]
        );
        users.push(row.rows[0].id);
      }
      const copies = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          repository.create(
            users[0],
            { ...input, name: `Имя ${index}` },
            digest
          )
        )
      );
      assert.equal(new Set(copies.map((copy) => copy.id)).size, 1);
      assert.equal((await repository.quota(users[0])).usedCount, 1);
      const foreign = await repository.create(users[1], input, digest);
      assert.notEqual(foreign.id, copies[0].id);
      await assert.rejects(repository.ownedCoastline(copies[0].id, users[1]), {
        status: 404,
      });
      const claimed = await repository.beginUpload(copies[0].id, users[0]);
      await assert.rejects(repository.beginUpload(copies[0].id, users[0]), {
        status: 409,
      });
      await repository.finishUpload(
        copies[0].id,
        users[0],
        claimed.object_key,
        digest
      );
      for (let index = 1; index < 20; index++)
        await repository.create(users[0], {
          ...input,
          filename: `other-${index}.geojson`,
          sizeBytes: 1,
        });
      assert.equal((await repository.quota(users[0])).usedCount, 20);
      assert.equal(
        (
          await repository.create(
            users[0],
            { ...input, name: "Повторное имя" },
            digest
          )
        ).id,
        copies[0].id
      );
      await assert.rejects(
        repository.create(users[0], { ...input, sourceRevision: "v2" }, digest),
        { status: 409 }
      );
      await assert.rejects(repository.create(users[0], input, "b".repeat(64)), {
        status: 409,
      });
      for (let index = 0; index < 4; index++)
        await repository.create(users[1], {
          ...input,
          filename: `large-${index}.geojson`,
          sizeBytes: 512 * 1024 ** 2 - (index === 3 ? input.sizeBytes : 0),
        });
      assert.equal((await repository.quota(users[1])).usedBytes, 2 * 1024 ** 3);
      await assert.rejects(
        repository.create(users[1], { ...input, sourceRevision: "v2" }, digest),
        { status: 409 }
      );
    } finally {
      if (users.length) {
        await db.query(
          "DELETE FROM scientific_inputs WHERE owner_id=ANY($1::uuid[])",
          [users]
        );
        await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
      }
      await db.onModuleDestroy();
    }
  }
);
