import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseService } from "../infrastructure/database.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";

test("повторная загрузка получает новый ключ, а завершение проверяет именно его", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const database = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT id FROM scientific_inputs")) return { rows: [{ id: "input" }] };
      if (sql.startsWith("UPDATE scientific_inputs SET status='uploading'"))
        return { rows: [{ id: "input", object_key: params[2] }] };
      if (sql.startsWith("UPDATE scientific_inputs SET status='ready'"))
        return { rows: [{ id: "input", object_key: params[2], created_at: new Date(), size_bytes: "1" }] };
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  const first = await repository.beginUpload("input", "owner");
  const second = await repository.beginUpload("input", "owner");
  assert.notEqual(first.object_key, second.object_key);
  assert.match(first.object_key, /^users\/owner\/scientific-inputs\/input\//);
  await repository.finishUpload("input", "owner", second.object_key, "a".repeat(64));
  assert.match(calls.at(-1)!.sql, /object_key=\$3 AND status='uploading'/);
  assert.equal(calls.at(-1)!.params[2], second.object_key);
});
