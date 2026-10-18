import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  formatQueueDiagnostics,
  parseQueueDiagnosticsArgs,
  readQueueDiagnostics,
} from "./queue-diagnostics.js";

test("параметры диагностики ограничивают пороги и профиль", () => {
  assert.deepEqual(parseQueueDiagnosticsArgs([]).profiles, [
    "standard",
    "heavy",
  ]);
  const options = parseQueueDiagnosticsArgs([
    "--",
    "--profile",
    "heavy",
    "--queue-wait-seconds=14400",
    "--json",
  ]);
  assert.deepEqual(options.profiles, ["heavy"]);
  assert.equal(options.queueWaitSeconds, 14400);
  assert.equal(options.json, true);
  assert.equal(options.requireWorker, false);
  assert.equal(parseQueueDiagnosticsArgs(["--profile", "standard", "--require-worker"]).requireWorker, true);
  for (const args of [
    ["--apply"],
    ["--profile", "unknown"],
    ["extra"],
    ["--queue-wait-seconds", "0"],
    ["--queue-wait-seconds", "604801"],
    ["--queue-wait-seconds", "2.5"],
    ["--queue-wait-seconds", "Infinity"],
    ["--stale-after-seconds", "59"],
    ["--stale-after-seconds", "86401"],
  ])
    assert.throws(() => parseQueueDiagnosticsArgs(args));
});

test("неполный снимок не становится исправной пустой очередью", async () => {
  await assert.rejects(
    readQueueDiagnostics(
      { query: async () => ({ rows: [] }) },
      parseQueueDiagnosticsArgs([])
    ),
    /неполный снимок/
  );
});

test("пустая очередь не подтверждает доступность idle worker", async () => {
  const emptyRow = {
    profile: "standard" as const,
    observed_at: new Date("2026-10-18T09:00:00Z"),
    queued_count: "0",
    running_count: "0",
    stale_running_count: "0",
    unassigned_running_count: "0",
    oldest_queued_seconds: null,
    oldest_heartbeat_seconds: null,
    recent_worker_count: "0",
    failed_24h_count: "0",
  };
  const report = await readQueueDiagnostics(
    { query: async () => ({ rows: [emptyRow] }) },
    parseQueueDiagnosticsArgs(["--profile", "standard"])
  );
  assert.equal(report.status, "no_alerts");
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.workerAvailability, "not_proven_by_heartbeat");
  assert.equal(report.profiles[0].recentWorkerCount, 0);
  assert.equal(report.profiles[0].oldestQueuedAgeSeconds, null);
  assert.match(
    formatQueueDiagnostics(report),
    /не подтверждает успешность расчёта/
  );
  const required = await readQueueDiagnostics(
    { query: async () => ({ rows: [emptyRow] }) },
    parseQueueDiagnosticsArgs(["--profile", "standard", "--require-worker"])
  );
  assert.equal(required.alerts[0].code, "worker_missing");
});

test("справка работает без конфигурации, сбой БД не раскрывает реквизиты", () => {
  const entrypoint = resolve(__dirname, "../scripts/queue-status.ts");
  const env = {
    ...process.env,
    DATABASE_URL:
      "postgresql://sensitive_user:sensitive_password@127.0.0.1:1/litora_test_unreachable",
    S3_ENDPOINT: "http://127.0.0.1:1",
    S3_BUCKET: "test-only",
    S3_ACCESS_KEY: "test-only",
    S3_SECRET_KEY: "test-only",
  };
  const run = (args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", entrypoint, ...args], {
      env,
      encoding: "utf8",
      timeout: 12000,
    });
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Свежий heartbeat worker не подтверждает/);
  const invalid = run(["--profile", "unknown"]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Профиль должен быть/);
  const failure = run(["--json"]);
  assert.equal(failure.status, 2);
  assert.equal(failure.stdout, "");
  assert.match(failure.stderr, /снимок не получен/);
  assert.doesNotMatch(failure.stderr, /sensitive_|postgresql:|\n\s+at /);
});
