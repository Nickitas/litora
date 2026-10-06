import assert from "node:assert/strict";
import { test } from "node:test";
import { validateScientificInput } from "./validation.js";

const valid = {
  name: "Полная береговая линия",
  role: "coastline_geojson",
  filename: "black-sea.geojson",
  sizeBytes: 1024,
  source: "Архив исследования",
  license: "ODbL",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
};

test("паспорт научного файла фиксирует только известные поля и единицы", () => {
  assert.deepEqual(validateScientificInput(valid), valid);
  for (const body of [
    { ...valid, role: "shell" },
    { ...valid, filename: "../../secret" },
    { ...valid, filename: "a\\b.geojson" },
    { ...valid, filename: "bad\nname" },
    { ...valid, sizeBytes: 512 * 1024 * 1024 + 1 },
    { ...valid, sizeBytes: 1.5 },
    { ...valid, crs: "EPSG:3857" },
    { ...valid, coordinateUnit: "mystery" },
    { ...valid, objectKey: "users/other/file" },
  ])
    assert.throws(() => validateScientificInput(body));
});
