import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

assert.equal(process.env.TEST_WORKER_FAILURES, "1",
  "Проверка сбоев worker требует TEST_WORKER_FAILURES=1");
const base = new URL(process.env.TEST_API_URL ?? "");
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const s3Endpoint = new URL(process.env.S3_ENDPOINT ?? "");
assert.equal(base.hostname, "localhost", "API должен быть локальным тестовым стендом");
assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname));
assert.match(databaseUrl.pathname, /^\/litora_test_[a-z0-9_]+$/);
assert.ok(["localhost", "127.0.0.1"].includes(s3Endpoint.hostname));
assert.ok(process.env.LITO_CLI_BINARY, "Укажите собранный Go CLI тестового стенда");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const invitation = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  .invitations?.[0]?.code;
assert.ok(invitation, "Передайте одноразовое приглашение через stdin");

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "litora-worker-failures-"));
const hangingCli = join(temporary, "hanging-cli.mjs");
await writeFile(hangingCli, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.TEST_CLI_PID_FILE, String(process.pid));
setInterval(() => {}, 1000);
`, { mode: 0o700 });
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const workers = new Set();
const cliPids = new Set();

async function request(path, method = "GET", body, token, expected = 200) {
  const response = await fetch(new URL(path, `${base.href}/`), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, expected, `${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

async function startWorker(binary, timeoutMs, pidFile) {
  const worker = spawn(process.execPath,
    ["--import", "tsx", "src/worker/main.ts"], {
      cwd: apiRoot,
      env: {
        ...process.env,
        LITO_WORKER_PROFILE: "standard",
        LITO_CLI_BINARY: binary,
        JOB_TIMEOUT_MS: String(timeoutMs),
        TEST_CLI_PID_FILE: pidFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  workers.add(worker);
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Worker не запустился за 30 секунд")), 30_000);
    const onData = (chunk) => {
      output += chunk.toString("utf8");
      if (output.includes(" готов")) {
        clearTimeout(timer);
        resolve();
      }
    };
    worker.stdout.on("data", onData);
    worker.stderr.on("data", onData);
    worker.once("error", reject);
    worker.once("exit", () => reject(new Error("Worker завершился до готовности")));
  });
  return worker;
}

async function stopWorker(worker, signal = "SIGTERM") {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  worker.kill(signal);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (worker.exitCode !== null || worker.signalCode !== null) return;
    await delay(100);
  }
  worker.kill("SIGKILL");
}

async function waitForFile(path) {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const pid = Number(await readFile(path, "utf8"));
      assert.ok(Number.isInteger(pid) && pid > 0);
      cliPids.add(pid);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(100);
  }
  throw new Error("Тестовый CLI не был запущен за 15 секунд");
}

async function assertProcessGroupStopped(pid) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await delay(100);
  }
  throw new Error("Тестовый CLI продолжает работу после timeout");
}

async function waitForJob(id, token, status) {
  let job;
  for (let attempt = 0; attempt < 60; attempt++) {
    job = await request(`calculations/${id}`, "GET", undefined, token);
    if (job.status === status) return job;
    if (!["queued", "running"].includes(job.status)) break;
    await delay(1000);
  }
  assert.equal(job?.status, status, `Задание ${id} не достигло статуса ${status}`);
}

try {
  const auth = await request("auth/register", "POST", {
    email: `worker-failures-${randomUUID()}@example.test`,
    password: `test-${randomUUID()}`,
    name: "Проверка сбоев worker",
    invitationCode: invitation,
  }, undefined, 201);
  const token = auth.accessToken;

  const timeoutPidFile = join(temporary, "timeout.pid");
  const timeoutWorker = await startWorker(hangingCli, 3000, timeoutPidFile);
  const timedOut = await request("calculations", "POST",
    { kind: "map", input: {} }, token, 201);
  await waitForFile(timeoutPidFile);
  const timeoutResult = await waitForJob(timedOut.id, token, "failed");
  assert.match(timeoutResult.errorMessage, /Расчёт прерван.*превышение времени/);
  assert.deepEqual(timeoutResult.artifacts.map((item) => item.filename), ["failure.log"]);
  await assertProcessGroupStopped(Number(await readFile(timeoutPidFile, "utf8")));
  await stopWorker(timeoutWorker);
  console.log("Timeout: зависший CLI остановлен, job failed, частичный результат не опубликован");

  const crashPidFile = join(temporary, "crash.pid");
  const crashedWorker = await startWorker(hangingCli, 300_000, crashPidFile);
  const crashed = await request("calculations", "POST",
    { kind: "map", input: {} }, token, 201);
  await waitForFile(crashPidFile);
  assert.equal((await request(`calculations/${crashed.id}`, "GET", undefined, token)).status,
    "running");
  await stopWorker(crashedWorker, "SIGKILL");
  const crashCliPid = Number(await readFile(crashPidFile, "utf8"));
  try { process.kill(-crashCliPid, "SIGKILL"); } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  const stale = await db.query(
    `UPDATE calculation_jobs SET heartbeat_at=now()-interval '61 seconds'
     WHERE id=$1 AND status='running' RETURNING id`, [crashed.id]);
  assert.equal(stale.rowCount, 1);

  const restartedWorker = await startWorker(process.env.LITO_CLI_BINARY, 300_000,
    join(temporary, "unused.pid"));
  const crashResult = await waitForJob(crashed.id, token, "failed");
  assert.match(crashResult.errorMessage, /Worker потерял связь/);
  assert.deepEqual(crashResult.artifacts, []);
  const resumed = await request("calculations", "POST",
    { kind: "map", input: {} }, token, 201);
  const resumedResult = await waitForJob(resumed.id, token, "succeeded");
  assert.ok(resumedResult.artifacts.some((item) => item.filename === "manifest.json"));
  await stopWorker(restartedWorker);
  console.log("Crash/restart: потерянный job failed, новый job завершён настоящим Go CLI");
} finally {
  for (const worker of workers) await stopWorker(worker, "SIGKILL");
  for (const pid of cliPids) {
    try { process.kill(-pid, "SIGKILL"); } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  await db.end();
  await rm(temporary, { recursive: true, force: true });
}
