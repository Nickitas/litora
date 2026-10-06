import type { ScientificInputRole } from "@litora/contracts";

/** Только эти артефакты Go имеют однозначную роль входного научного файла. */
export function reusableArtifactRole(jobKind: string, filename: string): ScientificInputRole | null {
  if (jobKind === "source_file" && /^[a-z0-9-]+-\d{8}-\d{6}\.(geojson|json)$/.test(filename))
    return "coastline_geojson";
  if (jobKind === "mesh" &&
      /^mesh\/msh\/black-sea-edge-\d+-detail-\d+-(delaunay|frontal-quad|parallelograms)\.msh$/.test(filename))
    return "flat_mesh_msh";
  if (jobKind === "seabed_build") {
    if (filename === "seabed/black-sea-depth.msh") return "seabed_msh";
    if (filename === "seabed/export-metadata.json") return "export_metadata_json";
  }
  if (jobKind === "seabed_adapt") {
    if (filename === "seabed/adaptive/size-field.csv") return "adaptive_field_csv";
    if (filename === "seabed/adaptive/size-field.json") return "adaptive_field_report_json";
  }
  return null;
}

export const maxReusableArtifactBytes = 2 * 1024 * 1024 * 1024;
export const maxReusableArtifactTotalBytes = 4 * 1024 * 1024 * 1024;
