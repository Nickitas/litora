import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import {
  CalculationsRepository,
  type JobRow,
} from "./calculations.repository.js";
import { parseHistoryPageQuery } from "./history-page.js";

const userId = "11111111-1111-4111-8111-111111111111";
const createdAt = new Date("2026-09-29T12:00:00.000Z");
const row = (id: string): JobRow & { cursor_created_at: string } => ({
  id,
  kind: "map",
  status: "succeeded",
  input: {},
  input_schema_version: 1,
  result_summary: null,
  result_schema_version: 1,
  core_version: null,
  method_id: null,
  method_revision: null,
  command_line: null,
  error_message: null,
  created_at: createdAt,
  cursor_created_at: "2026-09-29T12:00:00.000123Z",
  started_at: null,
  finished_at: null,
  updated_at: createdAt,
  worker_id: null,
  user_id: userId,
  dataset_id: null,
});

test("страница ограничена владельцем, использует tie-breaker и не подписывает файлы", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const database = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return sql.includes("count(*)")
        ? { rows: [{ total: "3" }] }
        : {
            rows: [
              row("33333333-3333-4333-8333-333333333333"),
              row("22222222-2222-4222-8222-222222222222"),
              row("11111111-1111-4111-8111-111111111111"),
            ],
          };
    },
  } as unknown as DatabaseService;
  const storage = {
    downloadUrl: () => {
      throw new Error("Список не должен подписывать файлы");
    },
  } as unknown as ObjectStorageService;
  const repository = new CalculationsRepository(database, storage);
  const query = parseHistoryPageQuery(
    { status: "succeeded", limit: "2" },
    userId,
  );
  const result = await repository.listPage(userId, query);
  assert.equal(result.totalCount, 3);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].artifacts.length, 0);
  assert.ok(result.nextCursor);
  assert.deepEqual(
    parseHistoryPageQuery(
      { status: "succeeded", limit: "2", cursor: result.nextCursor },
      userId,
    ).after,
    { createdAt: "2026-09-29T12:00:00.000123Z", id: result.items[1].id },
  );
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.sql, /user_id=\$1/);
    assert.equal(call.values[0], userId);
  }
  assert.match(calls[1].sql, /ORDER BY created_at DESC, id DESC/);
  assert.equal(calls[1].values.at(-1), 3);
});
