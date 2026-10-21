import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { validateDataset } from "./validation.js";

const directory = resolve(__dirname, "../../../../packages/generated-data/research");
function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
async function json(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(directory, name), "utf8"));
}

test("24 подготовленных контура принимаются API и имеют ожидаемый checksum геометрии", async () => {
  const config = record(await json("regions.json"));
  assert.ok(Array.isArray(config.regions));
  assert.equal(config.regions.length, 24);
  for (const item of config.regions) {
    const area = record(item);
    assert.equal(typeof area.id, "string");
    const metadata = record(await json(`${area.id}.metadata.json`));
    const source = record(metadata.source);
    const candidate = record(record(metadata.preparation).candidate);
    const file = record(metadata.file);
    const geometry = await json(`${area.id}.geojson`);
    const { dataset, bytes } = validateDataset({
      name: metadata.name,
      source: `${source.provider}, way ${candidate.sourceWayId}`,
      sourceRevision: `OSM ${source.osmBaseTime}; way v${candidate.sourceWayVersion}`,
      license: source.license,
      crs: metadata.crs,
      coordinateUnit: metadata.coordinateUnit,
      geometry,
    });
    assert.equal(dataset.geometry.coordinates.length, file.pointCount, String(area.id));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.canonicalGeometrySha256, String(area.id));
  }
});
