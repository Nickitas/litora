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

// Хеши поставляемого демо: менять только после проверки происхождения и обновления спецификации.
const pinnedSochiFiles = {
  "examples/sochi-local-segment.geojson":
    "5fc2e8625fc57021fb760cccc63cb6ff20848edd70e159453f34402faa99129a",
  "black-sea/sochi/waves-open-meteo.json":
    "ba7b0016ea1dceef7d326e960118c360cff10b899a970a9daad35ae31765a6c4",
  "black-sea/sochi/bathymetry-emodnet.json":
    "8364084b961b05f56b39059ca64b1dfcd26a08347b91338ffe819bdb0a47d0c5",
  "black-sea/sochi/structures-osm.json":
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  "black-sea/sochi/manifest.json":
    "6106d8b328e57e28b49283fd76bd088553ee2e8062ab708c5491746cb9c6aa6f",
} as const;

async function fingerprint(
  dataDirectory: string,
  path: string,
): Promise<InputFileProvenance> {
  const absolute = join(dataDirectory, path);
  try {
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("Не является обычным файлом");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(absolute))
      hash.update(chunk as Buffer);
    return {
      path: `data/${path}`,
      sizeBytes: info.size,
      sha256: hash.digest("hex"),
    };
  } catch {
    throw new Error(`Не удалось прочитать входной файл: ${path}`);
  }
}

function requiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`В паспорте демонстрационных данных нет ${key}`);
  return value;
}

export async function assertPinnedSochiInputs(
  dataDirectory: string,
): Promise<void> {
  for (const [path, expected] of Object.entries(pinnedSochiFiles)) {
    const actual = await fingerprint(dataDirectory, path);
    if (actual.sha256 !== expected)
      throw new Error(`Демонстрационный набор Сочи повреждён или изменён: ${path}`);
  }
  await bundledInputProvenance("erosion", dataDirectory);
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
  let raw: unknown;
  try {
    raw = JSON.parse(
      await readFile(join(dataDirectory, manifestPath), "utf8"),
    );
  } catch {
    throw new Error("Не удалось прочитать паспорт демонстрационных данных Сочи");
  }
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
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Некорректный инвентарь сооружений Сочи");
  }
  return {
    files: await Promise.all(paths.map((path) => fingerprint(dataDirectory, path))),
    declaredSources,
  };
}
