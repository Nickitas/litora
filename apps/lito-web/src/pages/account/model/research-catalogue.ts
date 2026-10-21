import {
  parseResearchDataset,
  type ResearchCatalogueEntry,
} from "@litora/generated-data/research";
import { researchGeometryUrls } from "@litora/generated-data/research-geometries";
import type { CreateDatasetDto } from "@litora/contracts";

const loaded = new Map<string, Promise<CreateDatasetDto>>();

export function loadResearchDataset(
  entry: ResearchCatalogueEntry
): Promise<CreateDatasetDto> {
  const cached = loaded.get(entry.id);
  if (cached) return cached;
  const promise = (async () => {
    const url = researchGeometryUrls[entry.id];
    if (!url) throw new Error("Геометрия участка отсутствует в каталоге");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Не удалось загрузить геометрию участка");
    const geometry: unknown = await response.json();
    const dataset = parseResearchDataset(entry, geometry);
    const bytes = new TextEncoder().encode(JSON.stringify(dataset.geometry));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    if (checksum !== entry.sha256)
      throw new Error("Геометрия участка не совпадает с паспортом");
    return dataset;
  })();
  loaded.set(entry.id, promise);
  void promise.catch(() => loaded.delete(entry.id));
  return promise;
}
