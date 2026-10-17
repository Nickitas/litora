import assert from "node:assert/strict";
import { test } from "node:test";
import { parseObservedShorelines } from "./observed-shorelines.js";

const feature = (date: string, coordinates: number[][]) => ({
  type: "Feature",
  properties: { date, satname: "S2", geoaccuracy: 1, cloud_cover: 0.12 },
  geometry: { type: "LineString", coordinates },
});
const coast = [[39.72, 43.58], [39.73, 43.59]];
const series = (features: unknown[], crs?: unknown) => Buffer.from(JSON.stringify({
  type: "FeatureCollection", features, ...(crs ? { crs } : {}),
}));

test("CoastSat GeoJSON сортируется по датам и сохраняет точные контуры", () => {
  const parsed = parseObservedShorelines(series([
    feature("2024-09-01 10:20:30", [[39.721, 43.58], [39.731, 43.59]]),
    feature("2020-01-01 00:00:00", coast),
  ]));
  assert.equal(parsed.frames[0].time, "2020-01-01T00:00:00.000Z");
  assert.deepEqual(parsed.frames[1].coordinates, [[39.721, 43.58], [39.731, 43.59]]);
  assert.deepEqual(parsed.bounds, [39.72, 43.58, 39.731, 43.59]);
});

test("проектные координаты, неизвестный CRS и повторная дата отклоняются", () => {
  const valid = [feature("2020-01-01 00:00:00", coast), feature("2021-01-01 00:00:00", coast)];
  assert.throws(() => parseObservedShorelines(series(valid, {
    type: "name", properties: { name: "EPSG:32637" },
  })), /EPSG:4326/);
  assert.throws(() => parseObservedShorelines(series([
    valid[0], feature("2021-01-01 00:00:00", [[500000, 4500000], [500010, 4500010]]),
  ])), /координаты/);
  assert.throws(() => parseObservedShorelines(series([valid[0], valid[0]])), /уникальными/);
  assert.throws(() => parseObservedShorelines(series([
    feature("2020-02-31 00:00:00", coast), valid[1],
  ])), /календарная/);
});

test("паспорт поправки уровня воды передаётся вместе с датой и проверяется", () => {
  const corrected = {
    ...feature("2020-01-01 00:00:00", coast),
    properties: { date: "2020-01-01 00:00:00", satname: "S2", tide_corrected: true,
      water_level_correction: { method: "по уровенному посту", source: "пост А", vertical_datum: "датум А" } },
  };
  const legacy = feature("2021-01-01 00:00:00", coast);
  const parsed = parseObservedShorelines(series([corrected, legacy]));
  assert.equal(parsed.frames[0].tideCorrected, true);
  assert.equal(parsed.frames[0].waterLevelCorrection?.verticalDatum, "датум А");
  assert.equal(parsed.frames[1].waterLevelCorrection, null);
  assert.throws(() => parseObservedShorelines(series([
    { ...corrected, properties: { ...corrected.properties, tide_corrected: false } }, legacy,
  ])), /tide_corrected=true/);
  assert.throws(() => parseObservedShorelines(series([
    { ...corrected, properties: { ...corrected.properties,
      water_level_correction: { ...corrected.properties.water_level_correction, vertical_datum: "" } } }, legacy,
  ])), /vertical_datum/);
  assert.throws(() => parseObservedShorelines(series([
    { ...corrected, properties: { ...corrected.properties,
      water_level_correction: { ...corrected.properties.water_level_correction, method: "метод".repeat(40) } } }, legacy,
  ])), /method/);
});
