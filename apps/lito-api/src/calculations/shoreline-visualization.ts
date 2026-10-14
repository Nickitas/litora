import type {
  ShorelinePointSeriesDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationFrameDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";

const chunkIdPattern = /^[0-9]{6}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableFinite(value: unknown): value is number | null {
  return value === null || finite(value);
}

function frameMetadata(
  value: unknown,
  index: number,
): ShorelineVisualizationFrameDto {
  if (
    !record(value) ||
    value.index !== index ||
    typeof value.chunkId !== "string" ||
    !chunkIdPattern.test(value.chunkId) ||
    !(value.time === null || typeof value.time === "string") ||
    !nullableFinite(value.durationHours) ||
    (value.durationHours !== null && value.durationHours <= 0) ||
    !nullableFinite(value.waveHeightM) ||
    !nullableFinite(value.erodedVolumeM3) ||
    !nullableFinite(value.depositedVolumeM3) ||
    !nullableFinite(value.balanceClosureResidualM3)
  )
    throw new Error("Некорректный индекс кадра");
  return {
    index,
    chunkId: value.chunkId,
    time: value.time,
    durationHours: value.durationHours,
    waveHeightM: value.waveHeightM,
    erodedVolumeM3: value.erodedVolumeM3,
    depositedVolumeM3: value.depositedVolumeM3,
    balanceClosureResidualM3: value.balanceClosureResidualM3,
  };
}

export function parseShorelineIndex(
  value: unknown,
): ShorelineVisualizationIndexDto {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    (value.mode !== "calendar" && value.mode !== "steps") ||
    typeof value.scenarioStatus !== "string" ||
    !Array.isArray(value.usageLimitations) ||
    !value.usageLimitations.every((item) => typeof item === "string") ||
    typeof value.waveSource !== "string" ||
    typeof value.bathymetrySha256 !== "string" ||
    typeof value.bathymetryStatus !== "string" ||
    value.crs !== "EPSG:4326" ||
    value.coordinateUnit !== "degrees" ||
    !Array.isArray(value.bounds) ||
    value.bounds.length !== 4 ||
    !value.bounds.every(finite) ||
    typeof value.pointCount !== "number" ||
    !Number.isInteger(value.pointCount) ||
    value.pointCount < 2 ||
    (value.pointSeries !== undefined &&
      (!record(value.pointSeries) || value.pointSeries.groupSize !== 10)) ||
    !Array.isArray(value.frames) ||
    value.frames.length < 2 ||
    value.frames.length > 10_001
  )
    throw new Error("Некорректный индекс визуализации");
  const [west, south, east, north] = value.bounds;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west > east ||
    south > north
  )
    throw new Error("Некорректные границы визуализации");
  const frames = value.frames.map(frameMetadata);
  if (
    frames.some((frame) =>
      value.mode === "calendar"
        ? frame.time === null || !Number.isFinite(Date.parse(frame.time))
        : frame.time !== null,
    )
  )
    throw new Error("Некорректные временные метки визуализации");
  if (value.mode === "calendar") {
    for (let position = 1; position < frames.length; position += 1) {
      if (
        Date.parse(frames[position].time ?? "") <=
        Date.parse(frames[position - 1].time ?? "")
      )
        throw new Error("Временные метки визуализации не упорядочены");
    }
  }
  return {
    schemaVersion: 1,
    mode: value.mode,
    scenarioStatus: value.scenarioStatus,
    usageLimitations: value.usageLimitations,
    waveSource: value.waveSource,
    bathymetrySha256: value.bathymetrySha256,
    bathymetryStatus: value.bathymetryStatus,
    crs: "EPSG:4326",
    coordinateUnit: "degrees",
    bounds: [
      value.bounds[0],
      value.bounds[1],
      value.bounds[2],
      value.bounds[3],
    ],
    pointCount: value.pointCount,
    ...(value.pointSeries === undefined
      ? {}
      : { pointSeries: { groupSize: 10 } }),
    frames,
  };
}

export function parseShorelinePointSeries(
  value: unknown,
  pointIndex: number,
  index: ShorelineVisualizationIndexDto,
): ShorelinePointSeriesDto {
  const groupSize = index.pointSeries?.groupSize;
  if (
    !groupSize ||
    !Number.isInteger(pointIndex) ||
    pointIndex < 0 ||
    pointIndex >= index.pointCount
  )
    throw new Error("Временной ряд узла недоступен");
  const pointStart = Math.floor(pointIndex / groupSize) * groupSize;
  const id = String(pointStart / groupSize + 1).padStart(6, "0");
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.id !== id ||
    value.pointStart !== pointStart ||
    !Array.isArray(value.series) ||
    value.series.length !== Math.min(groupSize, index.pointCount - pointStart)
  )
    throw new Error("Некорректный временной ряд узла");
  for (const row of value.series) {
    if (
      !Array.isArray(row) ||
      row.length !== index.frames.length ||
      row[0] !== null ||
      !row.every(nullableFinite)
    )
      throw new Error("Некорректные значения временного ряда узла");
  }
  return {
    schemaVersion: 1,
    pointIndex,
    shorelineChangeM: value.series[pointIndex - pointStart],
  };
}

export function parseShorelineChunk(
  value: unknown,
  id: string,
  index: ShorelineVisualizationIndexDto,
): ShorelineVisualizationChunkDto {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.id !== id ||
    !Array.isArray(value.frames) ||
    value.frames.length < 1 ||
    value.frames.length > 64
  )
    throw new Error("Некорректный файл кадров визуализации");
  const expected = index.frames
    .filter((frame) => frame.chunkId === id)
    .map((frame) => frame.index);
  if (expected.length !== value.frames.length)
    throw new Error("Кадры не соответствуют индексу визуализации");
  const frames = value.frames.map((item: unknown, position: number) => {
    if (
      !record(item) ||
      item.index !== expected[position] ||
      !Array.isArray(item.points) ||
      item.points.length !== index.pointCount ||
      !Array.isArray(item.cells) ||
      item.cells.length > index.pointCount
    )
      throw new Error("Некорректный кадр визуализации");
    const points = item.points.map((point: unknown) => {
      if (
        !record(point) ||
        !finite(point.lat) ||
        !finite(point.lon) ||
        point.lat < -90 ||
        point.lat > 90 ||
        point.lon < -180 ||
        point.lon > 180
      )
        throw new Error("Некорректные координаты кадра");
      return { lat: point.lat, lon: point.lon };
    });
    const cells = item.cells.map((cell: unknown) => {
      if (
        !record(cell) ||
        !Number.isInteger(cell.pointIndex) ||
        typeof cell.pointIndex !== "number" ||
        cell.pointIndex < 0 ||
        cell.pointIndex >= index.pointCount ||
        !finite(cell.shorelineChangeM)
      )
        throw new Error("Некорректные значения ячейки");
      return {
        pointIndex: cell.pointIndex,
        shorelineChangeM: cell.shorelineChangeM,
      };
    });
    return { index: item.index as number, points, cells };
  });
  return { schemaVersion: 1, id, frames };
}
