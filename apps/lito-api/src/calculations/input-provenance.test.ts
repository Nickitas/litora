import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { bundledInputProvenance } from "./input-provenance.js";

const dataDirectory = resolve(process.cwd(), "../lito-cli/data");

test("паспорта встроенных сценариев содержат хеши всех известных файлов", async () => {
  for (const [kind, expected] of [
    ["dimension", ["data/black-sea.json"]],
    [
      "map",
      ["data/black-sea.json", "data/examples/sochi-local-segment.geojson"],
    ],
  ] as const) {
    const provenance = await bundledInputProvenance(kind, dataDirectory);
    assert.deepEqual(provenance.files.map((file) => file.path), expected);
    for (const file of provenance.files) {
      const bytes = await readFile(
        join(dataDirectory, file.path.slice("data/".length)),
      );
      assert.equal(file.sizeBytes, bytes.length);
      assert.equal(
        file.sha256,
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
  }
  const erosion = await bundledInputProvenance("erosion", dataDirectory);
  assert.ok(
    erosion.files.some((file) => file.path.endsWith("waves-open-meteo.json")),
  );
  assert.ok(
    erosion.files.some((file) => file.path.endsWith("bathymetry-emodnet.json")),
  );
  assert.match(erosion.declaredSources!.waves, /Open-Meteo/);
});

test("неизвестный сценарий и неполный/ложный паспорт отвергаются", async () => {
  await assert.rejects(bundledInputProvenance("mesh", dataDirectory));
  const directory = await mkdtemp(join(tmpdir(), "litora-provenance-"));
  try {
    await mkdir(join(directory, "black-sea/sochi"), { recursive: true });
    await writeFile(join(directory, "black-sea/sochi/manifest.json"), "{}");
    await assert.rejects(
      bundledInputProvenance("erosion", directory),
      /generated_at/,
    );
    await assert.rejects(bundledInputProvenance("dimension", directory), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
