import type { ScientificInputRole } from "@litora/contracts";

export const scientificRoleLabels: Record<ScientificInputRole, string> = {
  coastline_geojson: "GeoJSON береговой линии или полного контура",
  shoreline_timeseries_geojson: "Датированные спутниковые контуры (GeoJSON)",
  wave_climate: "Волновой ряд (JSON или CSV)",
  shoreline_observations_json: "Независимые годовые скорости береговой линии (JSON)",
  longshore_sediment_sources_json: "Источники и стоки наносов по точкам (JSON)",
  longshore_structures_json: "Сооружения между соседними точками (JSON)",
  flat_mesh_msh: "Плоская расчётная сетка MSH",
  mesh_comparison_report_json: "Отчёт генерации плоской сетки (JSON)",
  seabed_msh: "Батиметрическая модель MSH",
  bathymetry_grid_json: "Проверенный набор батиметрии (JSON)",
  bathymetry_grid_metadata_json: "Паспорт набора батиметрии (JSON)",
  relief_reference_passport_json: "Паспорт независимой опорной модели (JSON)",
  export_metadata_json: "Паспорт экспорта EXPORT-02 (JSON)",
  bathymetry_source_json: "Паспорт источника батиметрии (JSON)",
  adaptive_field_csv: "Поле размера ADAPT-01 (CSV)",
  adaptive_field_report_json: "Отчёт поля ADAPT-01 (JSON)",
  adaptive_comparison_report_json: "Отчёт сравнения ADAPT-03 (JSON)",
  expert_organizer_key_json: "Закрытый ключ организатора AI-01 (JSON)",
  expert_ratings_tsv: "Заполненные оценки экспертов AI-02 (TSV)",
};
