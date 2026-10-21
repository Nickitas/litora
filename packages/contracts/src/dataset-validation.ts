import type { CreateDatasetDto } from "./index.js";

export const smallDatasetLimits = {
  maxBytes: 65_536,
  maxPoints: 500,
  maxPerUser: 100,
} as const;

/** Ошибка структуры малого набора; научные критерии проверяет Go. */
export class DatasetInputError extends Error {
  readonly status: 400 | 413;
  constructor(message: string, status: 400 | 413 = 400) {
    super(message);
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DatasetInputError("Ожидается объект набора данных");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    throw new DatasetInputError(
      `${field}: укажите текст до ${maximum} символов`,
    );
  return value.trim();
}

/** Проверяет общий вход web/API без анализа научной пригодности геометрии. */
export function parseCreateDataset(body: unknown): CreateDatasetDto {
  const data = record(body);
  const fields = [
    "name",
    "source",
    "sourceRevision",
    "license",
    "crs",
    "coordinateUnit",
    "geometry",
  ];
  if (Object.keys(data).some((key) => !fields.includes(key)))
    throw new DatasetInputError("Неизвестное поле набора данных");
  const name = text(data.name, "Название", 100);
  const source = text(data.source, "Источник", 200);
  const sourceRevision =
    data.sourceRevision === undefined
      ? undefined
      : text(data.sourceRevision, "Версия источника", 120);
  const license = text(data.license, "Лицензия", 100);
  if (data.crs !== "EPSG:4326" || data.coordinateUnit !== "degrees")
    throw new DatasetInputError("Поддерживаются только EPSG:4326 и градусы");
  const geometry = record(data.geometry);
  if (
    geometry.type !== "LineString" ||
    Object.keys(geometry).some((key) => !["type", "coordinates"].includes(key))
  )
    throw new DatasetInputError(
      "Ожидается GeoJSON LineString без дополнительных полей",
    );
  const coordinates = geometry.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > smallDatasetLimits.maxPoints ||
    coordinates.some(
      (point) =>
        !Array.isArray(point) ||
        point.length !== 2 ||
        point.some(
          (value) => typeof value !== "number" || !Number.isFinite(value),
        ),
    )
  )
    throw new DatasetInputError(
      `LineString должен содержать от 2 до ${smallDatasetLimits.maxPoints} пар чисел [долгота, широта]`,
    );
  const line = {
    type: "LineString" as const,
    coordinates: coordinates as [number, number][],
  };
  if (
    line.coordinates.some(
      ([longitude, latitude]) =>
        longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90,
    )
  )
    throw new DatasetInputError(
      "Координаты WGS84 должны быть в пределах долготы ±180° и широты ±90°",
    );
  if (
    new TextEncoder().encode(JSON.stringify(line)).byteLength >
    smallDatasetLimits.maxBytes
  )
    throw new DatasetInputError(
      `Размер GeoJSON не должен превышать ${smallDatasetLimits.maxBytes} байт`,
      413,
    );
  return {
    name,
    source,
    ...(sourceRevision === undefined ? {} : { sourceRevision }),
    license,
    crs: "EPSG:4326",
    coordinateUnit: "degrees",
    geometry: line,
  };
}
