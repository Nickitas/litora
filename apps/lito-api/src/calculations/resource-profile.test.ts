import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationsRepository } from "./calculations.repository.js";
import { resourceProfileForKind } from "./commands.js";

test("обычный worker не захватывает тяжёлые задания", async () => {
  const captured: { sql: string; params: unknown[] }[] = [];
  const database = {
    query: async (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const repository = new CalculationsRepository(database, {} as ObjectStorageService);
  assert.equal(resourceProfileForKind("mesh"), "heavy");
  assert.equal(resourceProfileForKind("seabed_validate"), "heavy");
  assert.equal(resourceProfileForKind("dimension_file"), "heavy");
  assert.equal(resourceProfileForKind("source_file"), "heavy");
  assert.equal(resourceProfileForKind("map_file"), "heavy");
  assert.equal(resourceProfileForKind("dimension"), "standard");
  await repository.claim("worker-1", "standard");
  await repository.claim("worker-2", "heavy");
  assert.equal(captured.length, 2);
  for (const request of captured)
    assert.match(request.sql, /resource_profile=\$2/);
  assert.deepEqual(captured.map((request) => request.params[1]), ["standard", "heavy"]);
});
