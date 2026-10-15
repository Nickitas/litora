import { BadRequestException } from "@nestjs/common";
import type { ObservedShorelineSeriesDto } from "@litora/contracts";

const invalid = (detail: string): never => {
  throw new BadRequestException(`GeoJSON наблюдений: ${detail}`);
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("ожидается объект");
  return value as Record<string, unknown>;
}

function acquisitionTime(value: unknown): string {
  if (typeof value !== "string") return invalid("у каждого контура должна быть дата");
  // CoastSat пишет дату UTC без суффикса часового пояса.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(normalized))
    return invalid("дата должна быть в UTC");
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== normalized.slice(0, 19))
    return invalid("некорректная календарная дата");
  return date.toISOString();
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return invalid(`некорректное поле ${label}`);
  return value;
}

/** Проверяет структуру наблюдений; не выполняет научных расчётов. */
export function parseObservedShorelines(bytes: Buffer): ObservedShorelineSeriesDto {
  let source: unknown;
  try {
    source = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    return invalid("файл не является JSON");
  }
  const collection = record(source);
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features))
    return invalid("ожидается FeatureCollection");
  if (collection.crs !== undefined) {
    const crs = record(collection.crs);
    const name = record(crs.properties).name;
    if (typeof name !== "string" || !/(?:EPSG:|EPSG::)4326$/i.test(name))
      return invalid("требуется EPSG:4326; преобразуйте CRS при экспорте CoastSat");
  }
  if (collection.features.length < 2 || collection.features.length > 2500)
    return invalid("требуется от 2 до 2500 датированных контуров");
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  let totalCoordinates = 0;
  const frames: ObservedShorelineSeriesDto["frames"] = [];
  for (const featureValue of collection.features) {
    const feature = record(featureValue);
    if (feature.type !== "Feature") return invalid("ожидается Feature");
    const geometry = record(feature.geometry);
    if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates))
      return invalid("поддерживаются только линии LineString");
    if (geometry.coordinates.length < 2)
      return invalid("контур должен содержать хотя бы две точки");
    totalCoordinates += geometry.coordinates.length;
    if (totalCoordinates > 120_000)
      return invalid("слишком много координат для интерактивной карты");
    const coordinates: [number, number][] = geometry.coordinates.map((point: unknown) => {
      if (!Array.isArray(point) || point.length < 2 ||
          typeof point[0] !== "number" || typeof point[1] !== "number" ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
          Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)
        return invalid("координаты должны быть [долгота, широта] в EPSG:4326");
      const lon = point[0];
      const lat = point[1];
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      return [lon, lat];
    });
    const properties = record(feature.properties);
    const satellite = properties.satname;
    if (typeof satellite !== "string" || !/^[A-Za-z0-9_-]{1,30}$/.test(satellite))
      return invalid("отсутствует идентификатор спутника satname");
    const cloudCover = optionalNumber(properties.cloud_cover, "cloud_cover");
    if (cloudCover !== null && cloudCover > 1)
      return invalid("cloud_cover должен быть долей от 0 до 1");
    frames.push({
      time: acquisitionTime(properties.date),
      satellite,
      geoAccuracy: optionalNumber(properties.geoaccuracy, "geoaccuracy"),
      cloudCover,
      coordinates,
    });
  }
  if (west === east || south === north)
    return invalid("географический охват вырожден");
  frames.sort((a, b) => a.time.localeCompare(b.time));
  if (frames.some((frame, index) => index > 0 && frame.time === frames[index - 1].time))
    return invalid("даты контуров должны быть уникальными");
  return { schemaVersion: 1, bounds: [west, south, east, north], frames };
}
