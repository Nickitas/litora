import {
  parseCreateDataset,
  type CreateDatasetDto,
  type DatasetDto,
} from "@litora/contracts";
import area0 from "../research/sochi-01.metadata.json" with { type: "json" };
import area1 from "../research/gelendzhik-01.metadata.json" with { type: "json" };
import area2 from "../research/turkey-01.metadata.json" with { type: "json" };
import area3 from "../research/anapa-01.metadata.json" with { type: "json" };
import area4 from "../research/batumi-01.metadata.json" with { type: "json" };
import area5 from "../research/burgas-01.metadata.json" with { type: "json" };
import area6 from "../research/danube-01.metadata.json" with { type: "json" };
import area7 from "../research/odesa-01.metadata.json" with { type: "json" };
import area8 from "../research/poti-rioni-01.metadata.json" with { type: "json" };
import area9 from "../research/kobuleti-01.metadata.json" with { type: "json" };
import area10 from "../research/trabzon-rize-01.metadata.json" with { type: "json" };
import area11 from "../research/giresun-01.metadata.json" with { type: "json" };
import area12 from "../research/yesilirmak-01.metadata.json" with { type: "json" };
import area13 from "../research/sinop-01.metadata.json" with { type: "json" };
import area14 from "../research/sakarya-01.metadata.json" with { type: "json" };
import area15 from "../research/kilyos-01.metadata.json" with { type: "json" };
import area16 from "../research/igneada-01.metadata.json" with { type: "json" };
import area17 from "../research/varna-kamchia-01.metadata.json" with { type: "json" };
import area18 from "../research/shabla-kaliakra-01.metadata.json" with { type: "json" };
import area19 from "../research/mamaia-01.metadata.json" with { type: "json" };
import area20 from "../research/tendra-01.metadata.json" with { type: "json" };
import area21 from "../research/kalamita-01.metadata.json" with { type: "json" };
import area22 from "../research/yalta-alushta-01.metadata.json" with { type: "json" };
import area23 from "../research/feodosia-koktebel-01.metadata.json" with { type: "json" };

/** Карточка поставляемого картографического фрагмента; точность положения не аттестована. */
export interface ResearchCatalogueEntry {
  id: string;
  name: string;
  queue: number;
  purpose: string;
  pointCount: number;
  sha256: string;
  sourceUrl: string;
  attributionUrl: string;
  licenseUrl: string;
  sourceDate: string;
  limitations: string[];
  dataset: Omit<CreateDatasetDto, "geometry">;
}

export const researchCatalogue: ResearchCatalogueEntry[] = [
  area0,
  area1,
  area2,
  area3,
  area4,
  area5,
  area6,
  area7,
  area8,
  area9,
  area10,
  area11,
  area12,
  area13,
  area14,
  area15,
  area16,
  area17,
  area18,
  area19,
  area20,
  area21,
  area22,
  area23,
].map((metadata) => ({
  id: metadata.regionId,
  name: metadata.name,
  queue: metadata.queue,
  purpose: metadata.purpose,
  pointCount: metadata.file.pointCount,
  sha256: metadata.file.canonicalGeometrySha256,
  sourceUrl: metadata.source.sourceUrl,
  attributionUrl: metadata.source.attributionUrl,
  licenseUrl: metadata.source.licenseUrl,
  sourceDate: metadata.source.osmBaseTime,
  limitations: metadata.limitations,
  dataset: {
    name: metadata.name,
    source: `${metadata.source.provider}, way ${metadata.preparation.candidate.sourceWayId}`,
    sourceRevision: `OSM ${metadata.source.osmBaseTime}; way v${metadata.preparation.candidate.sourceWayVersion}`,
    license: metadata.source.license,
    crs: "EPSG:4326",
    coordinateUnit: "degrees",
  },
}));

/** Находит свою копию независимо от пользовательского названия. */
export function findSavedResearchDataset(
  datasets: readonly DatasetDto[],
  entry: ResearchCatalogueEntry
) {
  return datasets.find(
    (dataset) =>
      dataset.sha256 === entry.sha256 &&
      dataset.source === entry.dataset.source &&
      (dataset.sourceRevision ?? "") === (entry.dataset.sourceRevision ?? "") &&
      dataset.license === entry.dataset.license &&
      dataset.crs === entry.dataset.crs &&
      dataset.coordinateUnit === entry.dataset.coordinateUnit &&
      dataset.pointCount === entry.pointCount
  );
}

/** Проверяет структуру поставляемой геометрии тем же правилом, что web/API. */
export function parseResearchDataset(
  entry: ResearchCatalogueEntry,
  geometry: unknown,
  name = entry.name
): CreateDatasetDto {
  const dataset = parseCreateDataset({ ...entry.dataset, name, geometry });
  if (dataset.geometry.coordinates.length !== entry.pointCount)
    throw new Error("Число точек каталога не совпадает с паспортом");
  return dataset;
}

