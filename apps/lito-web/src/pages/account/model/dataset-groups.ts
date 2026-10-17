import type { DatasetDto } from "@litora/contracts";

export interface DatasetGroup {
  dataset: DatasetDto;
  records: DatasetDto[];
}

// UUID и время создания не входят в паспорт содержимого: повторная запись
// того же GeoJSON остаётся отдельным объектом, но не отдельной карточкой.
export function groupDatasets(datasets: DatasetDto[]): DatasetGroup[] {
  const groups = new Map<string, DatasetGroup>();
  for (const dataset of datasets) {
    const key = JSON.stringify([
      dataset.schemaVersion,
      dataset.name,
      dataset.source,
      dataset.sourceRevision ?? "",
      dataset.license,
      dataset.crs,
      dataset.coordinateUnit,
      dataset.pointCount,
      dataset.sizeBytes,
      dataset.sha256,
    ]);
    const existing = groups.get(key);
    if (existing) existing.records.push(dataset);
    else groups.set(key, { dataset, records: [dataset] });
  }
  return [...groups.values()];
}
