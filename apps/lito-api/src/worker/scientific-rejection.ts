import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const rejectionReports: Record<string, { path: string; field: string }> = {
  seabed_build: { path: "seabed/build-report.json", field: "accepted" },
  seabed_generate_adaptive: { path: "seabed/adaptive/gmsh/generation-report.json", field: "accepted" },
  seabed_validate: { path: "seabed/quality/relief-quality.json", field: "metrics_accepted" },
  seabed_compare_adaptive: { path: "seabed/adaptive/comparison/adaptive-generator-comparison.json", field: "accepted" },
};

/** Допускает публикацию только отчёта, которым Go явно зафиксировал непринятый научный результат. */
export async function isScientificRejection(kind: string, output: string): Promise<boolean> {
  const report = rejectionReports[kind];
  if (!report) return false;
  const path = join(output, report.path);
  try {
    if ((await stat(path)).size > 2_000_000) return false;
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>)[report.field] === false;
  } catch {
    return false;
  }
}
