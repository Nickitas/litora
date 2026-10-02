import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import type { CreateDatasetDto } from "@litora/contracts";

export const maxDatasetBytes = 65_536;
export const maxDatasetPoints = 500;
export const maxDatasetsPerUser = 100;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Ожидается объект набора данных");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`${field}: укажите текст до ${max} символов`);
  return value.trim();
}

export function validateDataset(body: unknown): {
  dataset: CreateDatasetDto;
  bytes: Buffer;
} {
  const data = record(body);
  if (
    Object.keys(data).some(
      (key) =>
        ![
          "name",
          "source",
          "sourceRevision",
          "license",
          "crs",
          "coordinateUnit",
          "geometry",
        ].includes(key),
    )
  )
    throw new BadRequestException("Неизвестное поле набора данных");
  const name = text(data.name, "Название", 100);
  const source = text(data.source, "Источник", 200);
  const sourceRevision =
    data.sourceRevision === undefined
      ? undefined
      : text(data.sourceRevision, "Версия источника", 120);
  const license = text(data.license, "Лицензия", 100);
  if (data.crs !== "EPSG:4326" || data.coordinateUnit !== "degrees")
    throw new BadRequestException("Поддерживаются только EPSG:4326 и градусы");
  const geometry = record(data.geometry);
  if (
    geometry.type !== "LineString" ||
    Object.keys(geometry).some((key) => !["type", "coordinates"].includes(key))
  )
    throw new BadRequestException(
      "Ожидается GeoJSON LineString без дополнительных полей",
    );
  const coordinates = geometry.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > maxDatasetPoints ||
    coordinates.some(
      (point) =>
        !Array.isArray(point) ||
        point.length !== 2 ||
        point.some(
          (value) => typeof value !== "number" || !Number.isFinite(value),
        ),
    )
  )
    throw new BadRequestException(
      `LineString должен содержать от 2 до ${maxDatasetPoints} пар чисел [долгота, широта]`,
    );
  const line = {
    type: "LineString" as const,
    coordinates: coordinates as [number, number][],
  };
  if (
    line.coordinates.some(
      ([longitude, latitude]) =>
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90,
    )
  )
    throw new BadRequestException(
      "Координаты WGS84 должны быть в пределах долготы ±180° и широты ±90°",
    );
  const bytes = Buffer.from(JSON.stringify(line), "utf8");
  if (bytes.length > maxDatasetBytes)
    throw new PayloadTooLargeException(
      `Размер GeoJSON не должен превышать ${maxDatasetBytes} байт`,
    );
  return {
    dataset: {
      name,
      source,
      ...(sourceRevision === undefined ? {} : { sourceRevision }),
      license,
      crs: "EPSG:4326",
      coordinateUnit: "degrees",
      geometry: line,
    },
    bytes,
  };
}
