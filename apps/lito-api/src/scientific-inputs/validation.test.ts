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

test("волновой ряд принимает JSON/CSV с лимитом 16 МиБ", () => {
  const wave = { ...valid, role: "wave_climate", filename: "waves.csv", crs: "not-applicable", coordinateUnit: "not-applicable" };
  assert.deepEqual(validateScientificInput(wave), wave);
  assert.equal(validateScientificInput({ ...wave, filename: "waves.json" }).filename, "waves.json");
  for (const bad of [
    { ...wave, filename: "waves.txt" },
    { ...wave, filename: "../waves.csv" },
    { ...wave, sizeBytes: 16 * 1024 * 1024 + 1 },
    { ...wave, crs: "EPSG:4326" },
  ]) assert.throws(() => validateScientificInput(bad));
});
