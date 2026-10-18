import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkerPresence } from "./worker-presence.js";

test("worker регистрируется, обновляет heartbeat и отмечает остановку", async () => {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const presence = new WorkerPresence({
    async query(sql, values) {
      calls.push({ sql, values });
      return { rowCount: 1 };
    },
  }, "123e4567-e89b-42d3-a456-426614174000", "heavy");
  await presence.register();
  await presence.heartbeat();
  await presence.stop();
  assert.deepEqual(calls.map((call) => call.sql.trim().split(" ")[0]),
    ["INSERT", "DELETE", "UPDATE", "UPDATE"]);
  assert.deepEqual(calls[0].values, ["123e4567-e89b-42d3-a456-426614174000", "heavy"]);
  assert.match(calls[2].sql, /last_seen_at=now\(\)/);
  assert.match(calls[3].sql, /stopped_at=now\(\)/);
});

test("потеря регистрации прерывает heartbeat", async () => {
  const presence = new WorkerPresence({
    async query() { return { rowCount: 0 }; },
  }, "123e4567-e89b-42d3-a456-426614174000", "standard");
  await assert.rejects(presence.heartbeat(), /Регистрация worker потеряна/);
});
