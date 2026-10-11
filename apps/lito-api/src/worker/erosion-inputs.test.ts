import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageErosionBathymetry } from "./erosion-inputs.js";

test("worker сохраняет исходное имя батиметрии рядом с паспортом для проверки Go", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-erosion-test-"));
  try {
    const data = join(directory, "downloaded.json");
    const metadata = join(directory, "passport.json");
    await writeFile(data, "dataset");
    await writeFile(metadata, "passport");
    const staged = await stageErosionBathymetry(directory, data, metadata, "sea-grid.json");
    assert.equal(staged, join(directory, "erosion-inputs", "sea-grid.json"));
    assert.equal(await readFile(staged, "utf8"), "dataset");
    assert.equal(await readFile(join(directory, "erosion-inputs", "sea-grid.metadata.json"), "utf8"), "passport");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("worker не использует путь из имени загруженного файла", async () => {
  for (const name of ["../grid.json", "/tmp/grid.json", "grid.JSON/other", "grid.csv", ".json"])
    await assert.rejects(stageErosionBathymetry("/tmp/unimportant", "a", "b", name));
});
