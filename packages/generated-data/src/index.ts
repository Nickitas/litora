import type { CreateDatasetDto } from "@litora/contracts";

// Координаты из apps/lito-cli/data/examples/sochi-local-segment.geojson.
// При обновлении исходного примера синхронизируйте этот небольшой web-образец.
export const defaultCoastlineDataset: CreateDatasetDto = {
  name: "Пример: участок Сочи",
  source: "OpenStreetMap, way 59530506, выгрузка 2026-08-17",
  license: "ODbL",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  geometry: {
    type: "LineString",
    coordinates: [
      [39.667927, 43.6442458],
      [39.6739089, 43.6407472],
      [39.6792709, 43.6389198],
      [39.6853954, 43.6341751],
      [39.6907965, 43.6306556],
      [39.6948478, 43.6254352],
      [39.6976633, 43.6232291],
      [39.6995026, 43.6205021],
      [39.702295, 43.6141286],
      [39.7049418, 43.6069904],
      [39.7076189, 43.599683],
      [39.710089, 43.5924374],
      [39.7129247, 43.585476],
    ],
  },
};
