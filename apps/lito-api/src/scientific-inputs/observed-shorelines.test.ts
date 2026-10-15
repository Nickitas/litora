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
