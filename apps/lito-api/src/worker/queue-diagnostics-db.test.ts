import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";
import {
  parseQueueDiagnosticsArgs,
  readQueueDiagnostics,
} from "./queue-diagnostics.js";

const url = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL: диагностика различает профили, пороги и отсутствие heartbeat",
  { skip: !url },
  async () => {
    assert.ok(url);
    assert.match(new URL(url).pathname, /^\/litora_test_[a-z0-9_]+$/);
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Временная таблица изолирует сценарий от jobs параллельных DB suites.
      await client.query(`CREATE TEMP TABLE calculation_jobs (
      user_id uuid, resource_profile text, status text, created_at timestamptz,
      worker_id uuid, heartbeat_at timestamptz
    ) ON COMMIT DROP`);
      const empty = await readQueueDiagnostics(
        client,
        parseQueueDiagnosticsArgs([])
      );
      assert.equal(empty.status, "no_alerts");
      assert.equal(empty.profiles.length, 2);
      assert.ok(
        empty.profiles.every(
          (p) =>
            p.oldestQueuedAgeSeconds === null &&
            p.oldestHeartbeatAgeSeconds === null &&
            p.queuedCount === 0 &&
            p.runningCount === 0
        )
      );

      await client.query(`INSERT INTO calculation_jobs
      (user_id,resource_profile,status,created_at,worker_id,heartbeat_at)
      SELECT '11111111-1111-4111-8111-111111111111'::uuid, profile,status,
        now()-created_seconds*interval '1 second',
        CASE WHEN assigned THEN '22222222-2222-4222-8222-222222222222'::uuid END,
        now()-heartbeat_seconds*interval '1 second'
      FROM (VALUES
        ('standard','queued',301,false,NULL::integer),
        ('standard','queued',10,false,NULL),
        ('standard','running',90,true,2),
        ('standard','running',90,true,60),
        ('standard','running',90,true,61),
        ('standard','running',90,true,NULL),
        ('standard','running',90,false,NULL),
        ('standard','succeeded',900,true,900),
        ('heavy','queued',300,false,NULL),
        ('heavy','running',90,true,-2)
      ) AS fixture(profile,status,created_seconds,assigned,heartbeat_seconds)`);
      await client.query(`INSERT INTO calculation_jobs
      (user_id,resource_profile,status,created_at) VALUES
      (NULL,'heavy','queued',now()-interval '1 day')`);

      const report = await readQueueDiagnostics(
        client,
        parseQueueDiagnosticsArgs([])
      );
      assert.equal(report.status, "attention");
      assert.equal(report.workerAvailability, "unknown");
      const standard = report.profiles.find((p) => p.profile === "standard");
      assert.deepEqual(standard, {
        profile: "standard",
        queuedCount: 2,
        runningCount: 5,
        staleRunningCount: 2,
        unassignedRunningCount: 1,
        oldestQueuedAgeSeconds: 301,
        oldestHeartbeatAgeSeconds: 61,
      });
      const heavy = report.profiles.find((p) => p.profile === "heavy");
      assert.deepEqual(heavy, {
        profile: "heavy",
        queuedCount: 1,
        runningCount: 1,
        staleRunningCount: 0,
        unassignedRunningCount: 0,
        oldestQueuedAgeSeconds: 300,
        oldestHeartbeatAgeSeconds: 0,
      });
      assert.deepEqual(report.alerts.map((alert) => alert.code).sort(), [
        "queue_wait_exceeded",
        "stale_running",
        "unassigned_running",
      ]);
      assert.ok(report.alerts.every((alert) => alert.profile === "standard"));
      const selected = await readQueueDiagnostics(
        client,
        parseQueueDiagnosticsArgs([
          "--profile",
          "heavy",
          "--queue-wait-seconds",
          "299",
        ])
      );
      assert.equal(selected.profiles.length, 1);
      assert.equal(selected.alerts[0].code, "queue_wait_exceeded");
      assert.equal(selected.alerts[0].severity, "warning");
      assert.equal(
        (await client.query("SELECT count(*) FROM calculation_jobs")).rows[0]
          .count,
        "11"
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  }
);
