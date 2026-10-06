import type { ScientificInputRole } from "@litora/contracts";

export const scientificRoleLabels: Record<ScientificInputRole, string> = {
  coastline_geojson: "GeoJSON береговой линии или полного контура",
  flat_mesh_msh: "Плоская расчётная сетка MSH",
  seabed_msh: "Батиметрическая модель MSH",
  bathymetry_grid_json: "Проверенный набор батиметрии (JSON)",
  bathymetry_grid_metadata_json: "Паспорт набора батиметрии (JSON)",
  relief_reference_passport_json: "Паспорт независимой опорной модели (JSON)",
  export_metadata_json: "Паспорт экспорта EXPORT-02 (JSON)",
  bathymetry_source_json: "Паспорт источника батиметрии (JSON)",
  adaptive_field_csv: "Поле размера ADAPT-01 (CSV)",
  adaptive_field_report_json: "Отчёт поля ADAPT-01 (JSON)",
};
