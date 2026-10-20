import { BadRequestException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CoastlinePreviewDto } from "@litora/contracts";
import { environment } from "../config/environment.js";
import { bundledBlackSeaPath, bundledInputProvenance } from "./input-provenance.js";

export function previewGeoJSON(bytes: Buffer): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new BadRequestException("Контур должен быть корректным GeoJSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !["LineString", "MultiLineString", "Polygon", "MultiPolygon", "Feature", "FeatureCollection"].includes(String((value as Record<string, unknown>).type)))
    throw new BadRequestException("Этот файл не содержит поддерживаемой геометрии GeoJSON");
  return value as Record<string, unknown>;
}

export async function bundledCoastlinePreview(): Promise<CoastlinePreviewDto> {
  const provenance = await bundledInputProvenance("coastline_region", join(environment.cliDirectory, "data"));
  const bytes = await readFile(join(environment.cliDirectory, bundledBlackSeaPath));
  return { source: provenance.source!, sourceRevision: provenance.sourceRevision ?? null,
    license: provenance.license ?? null, sha256: provenance.files[0].sha256,
    crs: "EPSG:4326", geojson: previewGeoJSON(bytes) };
}
