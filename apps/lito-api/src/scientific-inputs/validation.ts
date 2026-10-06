import { BadRequestException } from "@nestjs/common";
import type {
  CreateScientificInputDto,
  ScientificInputRole,
} from "@litora/contracts";

export const maxScientificInputBytes = 512 * 1024 * 1024;
export const maxScientificInputsPerUser = 20;
export const maxScientificInputTotalBytes = 2 * 1024 * 1024 * 1024;

const roles = new Set<ScientificInputRole>([
  "coastline_geojson",
  "flat_mesh_msh",
  "seabed_msh",
  "bathymetry_grid_json",
  "bathymetry_grid_metadata_json",
  "relief_reference_passport_json",
  "export_metadata_json",
  "bathymetry_source_json",
  "adaptive_field_csv",
  "adaptive_field_report_json",
]);

function boundedText(
  value: unknown,
  label: string,
  maximum: number,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new BadRequestException(`Поле «${label}» заполнено неверно`);
  return value.trim();
}

export function validateScientificInput(body: unknown): CreateScientificInputDto {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Ожидается описание научного файла");
  const data = body as Record<string, unknown>;
  const fields = [
    "name", "role", "filename", "sizeBytes", "source",
    "sourceRevision", "license", "crs", "coordinateUnit",
  ];
  if (Object.keys(data).some((key) => !fields.includes(key)))
    throw new BadRequestException("Неизвестное поле научного файла");
  if (!roles.has(data.role as ScientificInputRole))
    throw new BadRequestException("Неизвестная роль научного файла");
  if (
    !Number.isSafeInteger(data.sizeBytes) ||
    Number(data.sizeBytes) < 1 ||
    Number(data.sizeBytes) > maxScientificInputBytes
  )
    throw new BadRequestException("Размер файла должен быть от 1 байта до 512 МиБ");
  const filename = boundedText(data.filename, "Имя файла", 160);
  if (
    filename === "." || filename === ".." ||
    filename.includes("/") || filename.includes("\\")
  )
    throw new BadRequestException("Имя файла не должно содержать путь");
  const crs = boundedText(data.crs, "CRS", 80);
  const coordinateUnit = boundedText(data.coordinateUnit, "Единицы", 80);
  if (!["EPSG:4326", "LAEA", "not-applicable"].includes(crs))
    throw new BadRequestException("Допустимы EPSG:4326, LAEA или not-applicable");
  if (!["degrees", "meters", "not-applicable"].includes(coordinateUnit))
    throw new BadRequestException("Недопустимые единицы координат");
  return {
    name: boundedText(data.name, "Название", 100),
    role: data.role as ScientificInputRole,
    filename,
    sizeBytes: Number(data.sizeBytes),
    source: boundedText(data.source, "Источник", 200),
    ...(data.sourceRevision === undefined
      ? {}
      : { sourceRevision: boundedText(data.sourceRevision, "Версия источника", 120) }),
    license: boundedText(data.license, "Лицензия", 100),
    crs,
    coordinateUnit,
  };
}
