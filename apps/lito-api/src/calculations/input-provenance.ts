import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface InputFileProvenance {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface BundledInputProvenance {
  files: InputFileProvenance[];
  declaredSources?: {
    generatedAt: string;
    coastline: string;
    waves: string;
    bathymetry: string;
    structures: string;
    structuresWarning: string;
  };
}

async function fingerprint(
  dataDirectory: string,
  path: string,
): Promise<InputFileProvenance> {
  const absolute = join(dataDirectory, path);
  const info = await stat(absolute);
  if (!info.isFile())
    throw new Error(`Входной файл не является обычным файлом: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(absolute)) hash.update(chunk as Buffer);
  return {
    path: `data/${path}`,
    sizeBytes: info.size,
    sha256: hash.digest("hex"),
  };
}

function requiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`В паспорте демонстрационных данных нет ${key}`);
  return value;
}

export async function bundledInputProvenance(
  kind: string,
  dataDirectory: string,
): Promise<BundledInputProvenance> {
  if (kind === "dimension" || kind === "map") {
    const paths = ["black-sea.json"];
    if (kind === "map") paths.push("examples/sochi-local-segment.geojson");
    return {
      files: await Promise.all(
        paths.map((path) => fingerprint(dataDirectory, path)),
      ),
    };
  }
  if (kind !== "erosion") throw new Error(`Нет паспорта входов для ${kind}`);

  const manifestPath = "black-sea/sochi/manifest.json";
  const raw: unknown = JSON.parse(
    await readFile(join(dataDirectory, manifestPath), "utf8"),
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Некорректный паспорт демонстрационных данных Сочи");
  const manifest = raw as Record<string, unknown>;
  const declaredSources = {
    generatedAt: requiredString(manifest.generated_at, "generated_at"),
    coastline: requiredString(manifest.coastline_source, "coastline_source"),
    waves: requiredString(manifest.wave_source, "wave_source"),
    bathymetry: requiredString(manifest.bathymetry_source, "bathymetry_source"),
    structures: requiredString(manifest.structures_source, "structures_source"),
    structuresWarning:
      typeof manifest.structures_warning === "string"
        ? manifest.structures_warning
        : "",
  };
  const paths = [
    "examples/sochi-local-segment.geojson",
    "black-sea/sochi/waves-open-meteo.json",
    "black-sea/sochi/bathymetry-emodnet.json",
    manifestPath,
  ];
  const structuresPath = "black-sea/sochi/structures-osm.json";
  try {
    const structures: unknown = JSON.parse(
      await readFile(join(dataDirectory, structuresPath), "utf8"),
    );
    if (!Array.isArray(structures))
      throw new Error("Некорректный инвентарь сооружений Сочи");
    paths.push(structuresPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    files: await Promise.all(paths.map((path) => fingerprint(dataDirectory, path))),
    declaredSources,
  };
}
