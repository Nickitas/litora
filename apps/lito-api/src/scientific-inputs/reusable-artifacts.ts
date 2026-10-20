import type { ScientificInputRole } from "@litora/contracts";

/** Только эти артефакты Go имеют однозначную роль входного научного файла. */
export function reusableArtifactRole(jobKind: string, filename: string): ScientificInputRole | null {
  if (jobKind === "coastline_region" && /^region\/segments\/segment-\d{3}\.geojson$/.test(filename)) return "coastline_geojson";
  if (jobKind === "source_file" && /^[a-z0-9-]+-\d{8}-\d{6}\.(geojson|json)$/.test(filename))
    return "coastline_geojson";
  if (jobKind === "mesh" &&
      /^mesh\/msh\/black-sea-edge-\d+-detail-\d+-(delaunay|frontal-quad|parallelograms)\.msh$/.test(filename))
    return "flat_mesh_msh";
  if (jobKind === "mesh" && filename === "mesh/mesh-comparison.json")
    return "mesh_comparison_report_json";
  if (jobKind === "seabed_generate_adaptive" &&
      filename === "seabed/adaptive/gmsh/black-sea-adaptive.msh")
    return "flat_mesh_msh";
  if (jobKind === "seabed_build") {
    if (filename === "seabed/black-sea-depth.msh") return "seabed_msh";
    if (filename === "seabed/export-metadata.json") return "export_metadata_json";
    if (filename === "seabed/bathymetry-source.json") return "bathymetry_source_json";
  }
  if (jobKind === "seabed_adapt") {
    if (filename === "seabed/adaptive/size-field.csv") return "adaptive_field_csv";
    if (filename === "seabed/adaptive/size-field.json") return "adaptive_field_report_json";
  }
  if (jobKind === "seabed_compare_adaptive") {
    if (filename === "seabed/adaptive/comparison/adaptive-generator-comparison.json")
      return "adaptive_comparison_report_json";
    if (filename === "seabed/expert-set/organizer-key.json")
      return "expert_organizer_key_json";
  }
  return null;
}

export const maxReusableArtifactBytes = 2 * 1024 * 1024 * 1024;
export const maxReusableArtifactTotalBytes = 4 * 1024 * 1024 * 1024;
