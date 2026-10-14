import { test } from "node:test";
import assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import type { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationsRepository } from "./calculations.repository.js";
import {
  parseShorelineChunk,
  parseShorelineIndex,
  parseShorelinePointSeries,
} from "./shoreline-visualization.js";

const index = parseShorelineIndex({
  schemaVersion: 1,
  mode: "calendar",
  scenarioStatus: "demo",
  usageLimitations: [],
  waveSource: "пример",
  bathymetrySha256: "abc",
  bathymetryStatus: "проверен",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  bounds: [39, 43, 40, 44],
  pointCount: 2,
  frames: [
    {
      index: 0,
      time: "2024-01-01T00:00:00Z",
      chunkId: "000001",
      durationHours: null,
      waveHeightM: null,
      erodedVolumeM3: null,
      depositedVolumeM3: null,
      balanceClosureResidualM3: null,
    },
    {
      index: 1,
      time: "2024-01-01T01:00:00Z",
      chunkId: "000001",
      durationHours: 1,
      waveHeightM: 1,
      erodedVolumeM3: 2,
      depositedVolumeM3: 0,
      balanceClosureResidualM3: 0,
    },
  ],
});

test("визуализация требует связанный chunk и валидные координаты", () => {
  assert.throws(() =>
    parseShorelineIndex({ ...index, bounds: [181, 43, 182, 44] }),
  );
  assert.throws(() =>
    parseShorelineIndex({
      ...index,
      frames: [
        index.frames[0],
        { ...index.frames[1], time: "2023-12-31T23:00:00Z" },
      ],
    }),
  );
  assert.throws(() =>
    parseShorelineChunk(
      { schemaVersion: 1, id: "000002", frames: [] },
      "000002",
      index,
    ),
  );
  assert.throws(() =>
    parseShorelineChunk(
      {
        schemaVersion: 1,
        id: "000001",
        frames: [
          {
            index: 0,
            points: [
              { lat: 999, lon: 39 },
              { lat: 43, lon: 40 },
            ],
            cells: [],
          },
          {
            index: 1,
            points: [
              { lat: 43, lon: 39 },
              { lat: 43, lon: 40 },
            ],
            cells: [],
          },
        ],
      },
      "000001",
      index,
    ),
  );
});

test("временной ряд возвращает выбранный узел и сохраняет пропуски", () => {
  const seriesIndex = { ...index, pointSeries: { groupSize: 10 as const } };
  const group = {
    schemaVersion: 1,
    id: "000001",
    pointStart: 0,
    series: [
      [null, -0.25],
      [null, null],
    ],
  };
  assert.deepEqual(parseShorelinePointSeries(group, 0, seriesIndex), {
    schemaVersion: 1,
    pointIndex: 0,
    shorelineChangeM: [null, -0.25],
  });
  assert.throws(() =>
    parseShorelinePointSeries({ ...group, id: "000002" }, 0, seriesIndex),
  );
  assert.throws(() =>
    parseShorelinePointSeries(
      {
        ...group,
        series: [
          [null, Number.NaN],
          [null, null],
        ],
      },
      0,
      seriesIndex,
    ),
  );
});

test("чужой расчёт не открывает объект S3", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const database = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const storage = {
    bucket: "private",
    readObjectBytes: () => {
      throw new Error("S3 не должен читаться");
    },
  } as unknown as ObjectStorageService;
  const repository = new CalculationsRepository(database, storage);
  await assert.rejects(
    () => repository.shorelineVisualization("job", "owner"),
    NotFoundException,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /j.user_id=\$2/);
  assert.match(calls[0].sql, /j.status='succeeded'/);
  assert.deepEqual(calls[0].values, [
    "job",
    "owner",
    "erosion/visualization/index.json",
    "private",
  ]);
  await assert.rejects(
    () => repository.shorelinePointSeries("job", "owner", "0"),
    NotFoundException,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].values, calls[0].values);
});
