import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  assertPinnedSochiInputs,
  bundledInputProvenance,
} from "./input-provenance.js";

const dataDirectory = resolve(process.cwd(), "../lito-cli/data");

test("паспорта встроенных сценариев содержат хеши всех известных файлов", async () => {
  for (const [kind, expected] of [
    ["dimension", ["data/coastline/black-sea.geojson", "data/coastline/black-sea.metadata.json"]],
    [
      "map",
      ["data/coastline/black-sea.geojson", "data/coastline/black-sea.metadata.json", "data/examples/sochi-local-segment.geojson"],
    ],
  ] as const) {
    const provenance = await bundledInputProvenance(kind, dataDirectory);
    assert.deepEqual(provenance.files.map((file) => file.path), expected);
    assert.match(provenance.source ?? "", /MarineRegions/);
    assert.equal(provenance.crs, "EPSG:4326");
    assert.equal(provenance.files[0].sha256, "116dcbc076ff0086e8bb3d72a34fc1df5353dc3c93c5cad91a99c336e039d246");
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
  const fullDemo = await bundledInputProvenance("all_demo", dataDirectory);
  assert.deepEqual(fullDemo, erosion);
  assert.ok(
    erosion.files.some((file) => file.path.endsWith("waves-open-meteo.json")),
  );
  assert.ok(
    erosion.files.some((file) => file.path.endsWith("bathymetry-emodnet.json")),
  );
  assert.match(erosion.declaredSources!.waves, /Open-Meteo/);
  await assertPinnedSochiInputs(dataDirectory);
});

test("усечённый снимок и повреждённый паспорт полного контура отвергаются", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-full-contour-"));
  try {
    await cp(dataDirectory, directory, { recursive: true });
    const bytes = await readFile(join(directory, "coastline/black-sea.geojson"));
    await writeFile(join(directory, "coastline/black-sea.geojson"), bytes.subarray(0, bytes.length - 1));
    await assert.rejects(bundledInputProvenance("dimension", directory), /не совпадает с паспортом/);
    await cp(join(dataDirectory, "coastline/black-sea.geojson"), join(directory, "coastline/black-sea.geojson"));
    const path = join(directory, "coastline/black-sea.metadata.json");
    const metadata = JSON.parse(await readFile(path, "utf8"));
    metadata.crs = "EPSG:3857";
    await writeFile(path, JSON.stringify(metadata));
    await assert.rejects(bundledInputProvenance("map", directory), /не совпадает с паспортом/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("изменённый демо-набор не попадает в Go worker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-pinned-demo-"));
  try {
    await cp(dataDirectory, directory, { recursive: true });
    await writeFile(join(directory, "black-sea/sochi/waves-open-meteo.json"), "[]");
    await assert.rejects(
      assertPinnedSochiInputs(directory),
      /повреждён или изменён.*waves-open-meteo/,
    );
    await rm(join(directory, "black-sea/sochi/waves-open-meteo.json"));
    await assert.rejects(
      assertPinnedSochiInputs(directory),
      /Не удалось прочитать входной файл.*waves-open-meteo/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    await assert.rejects(
      bundledInputProvenance("dimension", directory),
      /Не удалось прочитать входной файл/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
