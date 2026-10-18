import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createManifest } from "../../../scripts/backup-manifest.mjs";
import { captureInventory, verifyCopiedInventory } from "./backup-s3-inventory.mjs";

const instant = new Date("2026-10-18T10:00:00.000Z");
const snapshot = "s3://litora-backup/snapshots/20261018T100000Z/objects/";
const prefix = "snapshots/20261018T100000Z/objects/";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "litora-s3-inventory-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "litora.dump"), "test dump\n");
  await writeFile(join(directory, "artifacts.csv"), "bucket,object_key,size_bytes,sha256\n");
  return directory;
}

function client({ source = [], backup = [], fail = false } = {}) {
  return {
    async send(command) {
      const { Bucket, Prefix, ContinuationToken } = command.input;
      if (fail) throw new Error("S3 недоступен");
      const objects = Bucket === "litora-source" && Prefix === undefined
        ? source
        : Bucket === "litora-backup" && Prefix === prefix ? backup : null;
      if (!objects) throw new Error("Неожиданный bucket или prefix");
      const start = ContinuationToken ? Number(ContinuationToken) : 0;
      const page = objects.slice(start, start + 2);
      const next = start + page.length;
      return {
        Contents: page.map(({ key, size }) => ({ Key: key, Size: size })),
        IsTruncated: next < objects.length,
        NextContinuationToken: next < objects.length ? String(next) : undefined,
      };
    },
  };
}

const source = [
  { key: "users/a/a.txt", size: 10 },
  { key: "users/a/b.txt", size: 0 },
  { key: "users/b/c.txt", size: 20 },
];

test("фиксирует все страницы и сверяет ключи и размеры backup-prefix", async (t) => {
  const directory = await fixture(t);
  const backup = source.map((item) => ({ ...item, key: `${prefix}${item.key}` }));
  assert.deepEqual(await captureInventory(directory, "litora-source", client({ source })), {
    count: 3,
    bytes: 30,
  });
  await createManifest(directory, snapshot, instant);
  assert.deepEqual(await verifyCopiedInventory(directory, client({ backup }), 30, instant), {
    count: 3,
    bytes: 30,
  });
});

test("обнаруживает пропуск, изменение размера и лишний объект", async (t) => {
  const directory = await fixture(t);
  await captureInventory(directory, "litora-source", client({ source }));
  await createManifest(directory, snapshot, instant);
  const copied = source.map((item) => ({ ...item, key: `${prefix}${item.key}` }));
  await assert.rejects(
    verifyCopiedInventory(directory, client({ backup: copied.slice(0, 2) }), 30, instant),
    /не совпадает/,
  );
  await assert.rejects(
    verifyCopiedInventory(directory, client({ backup: [{ ...copied[0], size: 11 }, ...copied.slice(1)] }), 30, instant),
    /не совпадает/,
  );
  await assert.rejects(
    verifyCopiedInventory(directory, client({ backup: [...copied, { key: `${prefix}extra`, size: 1 }] }), 30, instant),
    /лишние объекты/,
  );
});

test("ошибка S3 не оставляет частичный опубликованный перечень", async (t) => {
  const directory = await fixture(t);
  await assert.rejects(captureInventory(directory, "litora-source", client({ fail: true })), /S3 недоступен/);
  assert.deepEqual((await readdir(directory)).sort(), ["artifacts.csv", "litora.dump"]);
});

test("не перезаписывает уже опубликованный перечень", async (t) => {
  const directory = await fixture(t);
  await captureInventory(directory, "litora-source", client({ source }));
  await assert.rejects(captureInventory(directory, "litora-source", client({ source: [] })), { code: "EEXIST" });
});
