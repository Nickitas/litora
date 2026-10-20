import assert from "node:assert/strict";
import { test } from "node:test";
import { commandArguments, scientificReferences, validateCalculation, resourceProfileForKind } from "./commands.js";
import { reusableArtifactRole } from "../scientific-inputs/reusable-artifacts.js";
import { resultMethodFromManifest } from "./result-method.js";

const area = { west: 38, south: 43, east: 40, north: 44.5 };
const file = "77777777-7777-4777-8777-777777777777";

test("выделение области передаёт в Go только границы и серверный путь", () => {
  const bundled = validateCalculation({ kind: "coastline_region", input: area });
  assert.equal(resourceProfileForKind("coastline_region"), "standard");
  assert.deepEqual(scientificReferences(bundled), []);
  const args = commandArguments(bundled, "/server/output");
  assert.deepEqual(args, ["region", "--input", "data/coastline/black-sea.geojson", "--west", "38", "--east", "40", "--south", "43", "--north", "44.5", "--output", "/server/output"]);
  const own = validateCalculation({ kind: "coastline_region", input: { ...area, coastlineInputId: file } });
  assert.deepEqual(scientificReferences(own), [{ field: "coastlineInputId", id: file, role: "coastline_geojson" }]);
  assert.equal(commandArguments(own, "/output", undefined, { coastlineInputId: "/server/owned.geojson" })[2], "/server/owned.geojson");
  for (const input of [
    { ...area, west: 41 }, { ...area, north: 42 }, { ...area, west: NaN }, { ...area, east: Infinity },
    { ...area, south: 39 }, { ...area, sourceUrl: "https://example.test" }, { ...area, coastlineInputId: "../../file" },
  ]) assert.throws(() => validateCalculation({ kind: "coastline_region", input }));
});

test("повторными входами становятся только отдельные линии нового успешного сценария", () => {
  assert.equal(reusableArtifactRole("coastline_region", "region/segments/segment-001.geojson"), "coastline_geojson");
  for (const filename of ["region/coastline.geojson", "region/selection.json", "region/segments/../secret.geojson", "region/segments/segment-1.geojson"])
    assert.equal(reusableArtifactRole("coastline_region", filename), null);
  assert.equal(reusableArtifactRole("map", "region/segments/segment-001.geojson"), null);
  assert.deepEqual(resultMethodFromManifest(Buffer.from(JSON.stringify({ schemaVersion: 2, command: "lito region", method: { id: "coastline-region", revision: "clip-1" } })), "coastline_region"), { id: "coastline-region", revision: "clip-1" });
});
