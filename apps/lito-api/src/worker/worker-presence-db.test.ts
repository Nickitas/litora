import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { WorkerPresence } from "./worker-presence.js";

const url = process.env.TEST_DATABASE_URL;

test("PostgreSQL: реестр worker обновляется и закрывается", { skip: !url }, async () => {
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/litora_test_[a-z0-9_]+$/);
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE worker_instances (
      id uuid PRIMARY KEY, resource_profile text NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(), stopped_at timestamptz
    ) ON COMMIT DROP`);
    const id = randomUUID();
    const presence = new WorkerPresence(client, id, "standard");
    await presence.register();
    await presence.heartbeat();
    let row = (await client.query(
      "SELECT resource_profile,stopped_at FROM worker_instances WHERE id=$1", [id]
    )).rows[0];
    assert.equal(row.resource_profile, "standard");
    assert.equal(row.stopped_at, null);
    await presence.stop();
    row = (await client.query(
      "SELECT stopped_at FROM worker_instances WHERE id=$1", [id]
    )).rows[0];
    assert.ok(row.stopped_at instanceof Date);
    await assert.rejects(presence.heartbeat(), /Регистрация worker потеряна/);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});
