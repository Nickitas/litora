import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationsRepository } from "./calculations.repository.js";
import { parseHistoryPageQuery } from "./history-page.js";

const url = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL: история не пропускает одинаковые timestamps и не показывает чужие jobs",
  { skip: !url },
  async () => {
    assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/);
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    const database = Object.create(
      DatabaseService.prototype,
    ) as DatabaseService;
    Object.defineProperty(database, "pool", { value: pool });
    const storage = {
      downloadUrl: () => {
        throw new Error("Список не должен подписывать файлы");
      },
    } as unknown as ObjectStorageService;
    const repository = new CalculationsRepository(database, storage);
    const users: string[] = [];
    try {
      await database.initialize();
      for (let index = 0; index < 2; index++) {
        const result = await database.query<{ id: string }>(
          "INSERT INTO users(email,password_hash,display_name) VALUES($1,'test-only','Тест истории') RETURNING id",
          [`${randomUUID()}@example.test`],
        );
        users.push(result.rows[0].id);
      }
      const ownIds = Array.from({ length: 3 }, () => randomUUID())
        .sort()
        .reverse();
      for (const id of ownIds) {
        await database.query(
          "INSERT INTO calculation_jobs(id,user_id,kind,status,created_at) VALUES($1,$2,'map','succeeded',$3::timestamptz)",
          [id, users[0], "2026-09-29T12:00:00.123456Z"],
        );
      }
      const foreignId = randomUUID();
      await database.query(
        "INSERT INTO calculation_jobs(id,user_id,kind,status,created_at) VALUES($1,$2,'map','succeeded',$3::timestamptz)",
        [foreignId, users[1], "2026-09-29T12:00:00.123456Z"],
      );
      const found: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 4; page++) {
        const options = parseHistoryPageQuery(
          {
            status: "succeeded",
            kind: "map",
            limit: "1",
            ...(cursor ? { cursor } : {}),
          },
          users[0],
        );
        const result = await repository.listPage(users[0], options);
        assert.equal(result.totalCount, 3);
        found.push(...result.items.map((item) => item.id));
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(found, ownIds);
      assert.equal(
        (
          await repository.listPage(
            users[0],
            parseHistoryPageQuery({ jobId: foreignId }, users[0]),
          )
        ).totalCount,
        0,
      );
    } finally {
      if (users.length) {
        await database.query(
          "DELETE FROM calculation_jobs WHERE user_id=ANY($1::uuid[])",
          [users],
        );
        await database.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
          users,
        ]);
      }
      await database.onModuleDestroy();
    }
  },
);
