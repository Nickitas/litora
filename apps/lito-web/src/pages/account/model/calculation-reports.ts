import { calculationReports, findCalculationReport, readAdaptiveVisualReports, type CalculationJobDto } from "@litora/contracts";

export const calculationReportLabels: Record<string, { title: string; description: string }> = Object.fromEntries(
  calculationReports.filter((report) => report.filename !== null).map((report) => [report.filename, { title: `${report.figure} · ${report.title}`, description: report.description }]),
);

/** Выбирает только SVG этого задания, подтверждённые текущим паспортом и SHA. */
export function requestedCalculationReports(job: CalculationJobDto) {
  const report = findCalculationReport(job.kind, job.input.reportType);
  if (!report) return [];
  if (report.filename !== null) {
    const file = job.artifacts.find((item) => item.category === "output" && item.filename === report.filename);
    return file ? [{ file, title: `${report.figure} · ${report.title}`, description: report.description }] : [];
  }
  const metrics: unknown = job.resultSummary?.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return [];
  if (!job.artifacts.some((item) => item.category === "output" && item.filename === report.indexFilename)) return [];
  const index = readAdaptiveVisualReports(Reflect.get(metrics, report.indexFilename.slice(report.indexFilename.lastIndexOf("/") + 1)));
  const passport = job.artifacts.find((item) => item.category === "output" && item.filename === "seabed/adaptive/comparison/adaptive-generator-comparison.json");
  if (!index || !passport || passport.sha256 !== index.comparison_report_sha256) return [];
  const entries = index.reports.filter((entry) => entry.report_type === report.type);
  const files = entries.flatMap((entry) => {
    const file = job.artifacts.find((item) => item.category === "output" && item.filename === entry.filename && item.sha256 === entry.sha256);
    return file ? [{ file, title: entry.title, description: entry.description }] : [];
  });
  return files.length === entries.length ? files : [];
}
