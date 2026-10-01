import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDataset } from "./validation.js";

const valid = {
  name: "  Участок Сочи  ",
  source: "Съёмка пользователя, 2026",
  license: "Разрешено использовать в Litora",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  geometry: {
    type: "LineString",
    coordinates: [
      [39.67, 43.64],
      [39.68, 43.63],
    ],
  },
};

test("набор фиксирует метаданные и ограниченные байты GeoJSON", () => {
  const { dataset, bytes } = validateDataset(valid);
  assert.equal(dataset.name, "Участок Сочи");
  assert.equal(dataset.sourceRevision, undefined);
  assert.deepEqual(JSON.parse(bytes.toString("utf8")), valid.geometry);
  assert.ok(bytes.length <= 65_536);
  assert.equal(
    validateDataset({ ...valid, sourceRevision: "  снимок-2026-08-17  " })
      .dataset.sourceRevision,
    "снимок-2026-08-17",
  );
});

test("набор не принимает иной CRS, единицы, формат, URL/путь или неверные точки", () => {
  for (const body of [
    { ...valid, crs: "EPSG:3857" },
    { ...valid, coordinateUnit: "meters" },
    { ...valid, sourceRevision: " " },
    { ...valid, sourceRevision: "a".repeat(121) },
    { ...valid, geometry: { type: "Polygon", coordinates: [] } },
    {
      ...valid,
      geometry: { type: "LineString", coordinates: [[39.67, 43.64]] },
    },
    {
      ...valid,
      geometry: {
        type: "LineString",
        coordinates: [
          [39.67, 43.64, 5],
          [39.68, 43.63],
        ],
      },
    },
    {
      ...valid,
      geometry: {
        type: "LineString",
        coordinates: [
          [39.67, 43.64],
          [NaN, 43.63],
        ],
      },
    },
    {
      ...valid,
      geometry: {
        type: "LineString",
        coordinates: [[181, 43.64], [39.68, 43.63]],
      },
    },
    {
      ...valid,
      geometry: {
        type: "LineString",
        coordinates: [[39.67, -91], [39.68, 43.63]],
      },
    },
    {
      ...valid,
      geometry: {
        type: "LineString",
        coordinates: Array.from({ length: 501 }, () => [39.67, 43.64]),
      },
    },
    { ...valid, source: "" },
    { ...valid, path: "/etc/passwd" },
    { ...valid, url: "http://internal" },
    { ...valid, geometry: { ...valid.geometry, crs: "EPSG:3857" } },
  ])
    assert.throws(() => validateDataset(body));
});
