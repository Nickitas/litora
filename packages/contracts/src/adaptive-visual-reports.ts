/** Открытая запись индекса Go: не содержит ключ анонимизации AI-01. */
export interface AdaptiveVisualReportDto {
  report_type: "adaptive_mesh_overviews" | "adaptive_mesh_windows" | "expert_fragment_cards";
  filename: string;
  sha256: string;
  title: string;
  description: string;
}

/** Индекс SVG текущего ADAPT-03; все пути относительны каталогу результатов. */
export interface AdaptiveVisualReportsDto {
  schema_version: "lito-adaptive-visual-reports/v1";
  comparison_report_sha256: string;
  reports: AdaptiveVisualReportDto[];
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const levelAndGenerator = "[a-z0-9][a-z0-9-]*\\/(?:delaunay|frontal-quad|parallelograms)";
const filenames = {
  adaptive_mesh_overviews: new RegExp(`^seabed/adaptive/comparison/${levelAndGenerator}/mesh-preview\\.svg$`),
  adaptive_mesh_windows: new RegExp(`^seabed/adaptive/comparison/${levelAndGenerator}/mesh-window-kizilirmak(?:-publication)?\\.svg$`),
  expert_fragment_cards: /^seabed\/expert-set\/cards\/E-\d{3,}\.svg$/,
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Проверяет внешний индекс, включая разрешённые типы, пути и отсутствие дублей. */
export function readAdaptiveVisualReports(value: unknown): AdaptiveVisualReportsDto | null {
  if (!record(value) || value.schema_version !== "lito-adaptive-visual-reports/v1" ||
    typeof value.comparison_report_sha256 !== "string" || value.comparison_report_sha256.length !== 64 || !sha256Pattern.test(value.comparison_report_sha256) ||
    !Array.isArray(value.reports) || value.reports.length > 200) return null;
  const reports: AdaptiveVisualReportDto[] = [];
  const seen = new Set<string>();
  for (const entry of value.reports) {
    if (!record(entry)) return null;
    const { report_type: type, filename, sha256, title, description } = entry;
    if (type !== "adaptive_mesh_overviews" && type !== "adaptive_mesh_windows" && type !== "expert_fragment_cards") return null;
    if (typeof filename !== "string" || filename.trim() !== filename || !filenames[type].test(filename) || seen.has(filename) ||
      typeof sha256 !== "string" || sha256.length !== 64 || !sha256Pattern.test(sha256) ||
      typeof title !== "string" || !title.trim() || title.length > 300 ||
      typeof description !== "string" || !description.trim() || description.length > 1500) return null;
    seen.add(filename);
    reports.push({ report_type: type, filename, sha256, title, description });
  }
  return { schema_version: value.schema_version, comparison_report_sha256: value.comparison_report_sha256, reports };
}
