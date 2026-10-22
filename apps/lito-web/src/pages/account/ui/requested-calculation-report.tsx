import { findCalculationReport, type CalculationJobDto } from "@litora/contracts";
import { CalculationImagePreview } from "./calculation-image-preview";

export function RequestedCalculationReport({ job, onRefreshLinks }: {
  job: CalculationJobDto;
  onRefreshLinks: () => void;
}) {
  const report = findCalculationReport(job.kind, job.input.reportType);
  if (!report) return null;
  const file = job.artifacts.find((item) => item.category === "output" && item.filename === report.filename);
  return (
    <section aria-labelledby="requested-report-heading" className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 id="requested-report-heading" className="text-xl font-semibold">Выбранный отчёт: {report.title}</h2>
      <p className="text-sm text-muted-foreground">{report.description}</p>
      {file ? (
        <CalculationImagePreview file={file} alt={`${report.figure} · ${report.title}`} caption={`${report.figure} · ${report.title}`} onRefreshLinks={onRefreshLinks} />
      ) : job.status === "succeeded" ? (
        <p role="alert" className="text-sm text-status-failed">Выбранный отчёт отсутствует среди результатов. Проверьте журнал расчёта и список файлов.</p>
      ) : job.status === "queued" || job.status === "running" ? (
        <p role="status" className="text-sm text-muted-foreground">SVG появится после завершения расчёта.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Выбранный SVG не сформирован: расчёт завершён с ошибкой или отменён.</p>
      )}
    </section>
  );
}
