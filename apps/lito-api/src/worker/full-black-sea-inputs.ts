import type { ScientificInputRole } from "@litora/contracts";
import { maxFullBlackSeaMeshBytes, maxMeshComparisonReportBytes } from "../scientific-inputs/validation.js";

/** Отсекает большие входы QA-03 до загрузки объекта и запуска Go. */
export function assertFullBlackSeaStagingLimit(
  kind: string,
  field: string,
  role: ScientificInputRole,
  sizeBytes: number,
): void {
  if (kind === "seabed_check_full" && field === "flatMeshInputId" && sizeBytes > maxFullBlackSeaMeshBytes)
    throw new Error("Плоская MSH для QA-03 превышает 256 МиБ");
  if (role === "mesh_comparison_report_json" && sizeBytes > maxMeshComparisonReportBytes)
    throw new Error("Отчёт генерации MSH превышает 2 МиБ");
}
