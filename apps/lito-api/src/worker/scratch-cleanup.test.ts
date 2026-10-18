import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cleanupHeavyScratch, markHeavyScratch, type ScratchDatabase, type ScratchJob } from "./scratch-cleanup.js";

const id = "123e4567-e89b-42d3-a456-426614174000";
const secondId = "123e4567-e89b-42d3-a456-426614174001";
const now = Date.now();
const old = new Date(now - 2 * 24 * 60 * 60 * 1000);

function database(jobs: ScratchJob[], active = false): ScratchDatabase {
  return {
    async getJob(jobId) { return jobs.find((job) => job.id === jobId); },
    async hasActiveHeavy() { return active; },
  };
}

function finished(jobId = id): ScratchJob {
  return { id: jobId, status: "failed", resource_profile: "heavy", worker_id: null, finished_at: old };
}

async function fixture(root: string, jobId = id): Promise<string> {
  const directory = join(root, jobId);
  await mkdir(directory);
  await markHeavyScratch(directory, jobId);
  await mkdir(join(directory, "output"));
  await writeFile(join(directory, "input.geojson"), "{}");
  await writeFile(join(directory, "output", "report.txt"), "result");
  for (const path of [join(directory, "input.geojson"), join(directory, "output", "report.txt"),
    join(directory, ".litora-scratch.json"), join(directory, "output"), directory])
    await utimes(path, old, old);
  return directory;
}

async function inScratch(action: (root: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "litora-scratch-test-"));
  try { await action(await realpath(directory)); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("маркер создаётся до входов и не может быть перезаписан", async () => {
  await inScratch(async (root) => {
    const directory = join(root, id);
    await mkdir(directory);
    await markHeavyScratch(directory, id);
    assert.deepEqual(JSON.parse(await readFile(join(directory, ".litora-scratch.json"), "utf8")),
      { schemaVersion: 1, jobId: id, resourceProfile: "heavy" });
    await assert.rejects(markHeavyScratch(directory, id));
  });
});

test("после имитации аварии dry-run не удаляет, apply удаляет только старый завершённый job", async () => {
  await inScratch(async (root) => {
    const directory = await fixture(root);
    const db = database([finished()]);
    assert.deepEqual(await cleanupHeavyScratch(root, db, { now }),
      { scanned: 1, eligible: 1, removed: 0, skipped: 0, limited: false });
    assert.deepEqual(await readdir(directory), [".litora-scratch.json", "input.geojson", "output"]);
    await assert.rejects(cleanupHeavyScratch(root, db, { apply: true, now }), /confirm-root/);
    const report = await cleanupHeavyScratch(root, db, { apply: true, confirmRoot: root, now });
    assert.equal(report.removed, 1);
    assert.deepEqual(await readdir(root), []);
  });
});

test("активная очередь и активный job защищены", async () => {
  await inScratch(async (root) => {
    await fixture(root);
    await assert.rejects(cleanupHeavyScratch(root, database([finished()], true),
      { apply: true, confirmRoot: root, now }), /очередь/);
    const running = { ...finished(), status: "running", worker_id: "worker-1" };
    const report = await cleanupHeavyScratch(root, database([running]),
      { apply: true, confirmRoot: root, now });
    assert.equal(report.removed, 0);
  });
});

test("неверный профиль, занятый worker и новый finished_at не проходят проверку", async () => {
  await inScratch(async (root) => {
    await fixture(root);
    for (const job of [
      { ...finished(), resource_profile: "standard" },
      { ...finished(), worker_id: "worker-1" },
      { ...finished(), finished_at: new Date(now) },
    ]) {
      const report = await cleanupHeavyScratch(root, database([job]),
        { apply: true, confirmRoot: root, now });
      assert.equal(report.removed, 0);
    }
    assert.deepEqual(await readdir(root), [id]);
  });
});

test("непомеченные, неизвестные, свежие и symlink-каталоги не удаляются", async () => {
  await inScratch(async (root) => {
    const directory = await fixture(root);
    await mkdir(join(root, secondId));
    await writeFile(join(root, secondId, "important.txt"), "keep");
    let report = await cleanupHeavyScratch(root, database([]), { apply: true, confirmRoot: root, now });
    assert.equal(report.removed, 0);
    await writeFile(join(directory, "new.txt"), "new");
    report = await cleanupHeavyScratch(root, database([finished()]), { apply: true, confirmRoot: root, now });
    assert.equal(report.removed, 0);
    await rm(join(directory, "new.txt"));
    await symlink(join(root, secondId), join(directory, "link"));
    report = await cleanupHeavyScratch(root, database([finished()]), { apply: true, confirmRoot: root, now });
    assert.equal(report.removed, 0);
    assert.equal((await readFile(join(root, secondId, "important.txt"), "utf8")), "keep");
  });
});

test("лимит удаления и повторная проверка состояния БД", async () => {
  await inScratch(async (root) => {
    await fixture(root);
    await fixture(root, secondId);
    const report = await cleanupHeavyScratch(root, database([finished(), finished(secondId)]),
      { apply: true, confirmRoot: root, now, maxRemove: 1 });
    assert.equal(report.removed, 1);
    assert.equal(report.limited, true);
  });
  await inScratch(async (root) => {
    await fixture(root);
    let calls = 0;
    const db: ScratchDatabase = {
      async getJob() { return ++calls === 1 ? finished() : { ...finished(), status: "running" }; },
      async hasActiveHeavy() { return false; },
    };
    const report = await cleanupHeavyScratch(root, db, { apply: true, confirmRoot: root, now });
    assert.equal(report.removed, 0);
    assert.deepEqual(await readdir(root), [id]);
  });
});

test("symlink вместо корня и слишком большой лимит отклоняются", async () => {
  await inScratch(async (root) => {
    const link = join(root, "linked");
    await symlink(root, link);
    await assert.rejects(cleanupHeavyScratch(link, database([])), /symlink/);
    await assert.rejects(cleanupHeavyScratch(root, database([]), { maxRemove: 51 }), /maxRemove/);
  });
});
