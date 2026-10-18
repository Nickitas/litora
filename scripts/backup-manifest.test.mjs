import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createManifest, verifyManifest } from "./backup-manifest.mjs";

const instant = new Date("2026-10-18T10:00:00.000Z");
const uri = "s3://litora-backup/snapshots/20261018T100000Z/objects/";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "litora-backup-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "litora.dump"), "test dump\n");
  await writeFile(join(directory, "artifacts.csv"), "bucket,object_key,size_bytes,sha256\n");
  await writeFile(join(directory, "objects.ndjson"), '{"schemaVersion":1,"sourceBucket":"litora"}\n');
  return directory;
}

test("создаёт приватный манифест и проверяет свежую копию", async (t) => {
  const directory = await fixture(t);
  const manifest = await createManifest(directory, uri, instant);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.files["litora.dump"].bytes, 10);
  assert.equal((await verifyManifest(directory, 30, instant)).s3SnapshotUri, uri);
  await assert.rejects(createManifest(directory, uri, instant), { code: "EEXIST" });
});

test("не принимает повреждённый и отсутствующий дамп", async (t) => {
  const directory = await fixture(t);
  await createManifest(directory, uri, instant);
  await writeFile(join(directory, "litora.dump"), "other dump\n");
  await assert.rejects(verifyManifest(directory, 30, instant), /SHA-256 не совпадает/);
  await rm(join(directory, "litora.dump"));
  await assert.rejects(verifyManifest(directory, 30, instant), { code: "ENOENT" });
});

test("не принимает устаревшую или будущую копию", async (t) => {
  const directory = await fixture(t);
  await createManifest(directory, uri, instant);
  await assert.rejects(
    verifyManifest(directory, 24, new Date("2026-10-20T10:00:00.000Z")),
    /устарела/,
  );
  await assert.rejects(
    verifyManifest(directory, 24, new Date("2026-10-18T09:50:00.000Z")),
    /в будущем/,
  );
});

test("не принимает symlink вместо дампа или манифеста", async (t) => {
  const directory = await fixture(t);
  await rm(join(directory, "litora.dump"));
  await symlink(join(directory, "artifacts.csv"), join(directory, "litora.dump"));
  await assert.rejects(createManifest(directory, uri, instant), /обычный файл/);
  await rm(join(directory, "litora.dump"));
  await writeFile(join(directory, "litora.dump"), "test dump\n");
  await createManifest(directory, uri, instant);
  const raw = await readFile(join(directory, "backup-manifest.json"));
  await rm(join(directory, "backup-manifest.json"));
  await writeFile(join(directory, "other.json"), raw);
  await symlink(join(directory, "other.json"), join(directory, "backup-manifest.json"));
  await assert.rejects(verifyManifest(directory, 30, instant), /обычным файлом/);
});

test("не принимает неуникальный S3 URI и пустой файл", async (t) => {
  const directory = await fixture(t);
  await assert.rejects(createManifest(directory, "s3://litora-backup/", instant), /уникальный S3 URI/);
  await writeFile(join(directory, "litora.dump"), "");
  await assert.rejects(createManifest(directory, uri, instant), /непустой обычный файл/);
});

test("не записывает манифест через symlink каталога", async (t) => {
  const directory = await fixture(t);
  const link = join(directory, "shortcut");
  await symlink(directory, link);
  await assert.rejects(createManifest(link, uri, instant), /обычной директорией/);
});

test("не принимает испорченную запись манифеста", async (t) => {
  const directory = await fixture(t);
  const manifest = await createManifest(directory, uri, instant);
  manifest.files["litora.dump"].sha256 = "a";
  await writeFile(join(directory, "backup-manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyManifest(directory, 30, instant), /некорректная запись/);
});
