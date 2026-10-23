import { findCalculationReport, type CalculationJobDto } from "@litora/contracts";
import { CalculationImagePreview } from "./calculation-image-preview";
import { requestedCalculationReports } from "../model/calculation-reports";

export function RequestedCalculationReport({ job, onRefreshLinks }: {
  job: CalculationJobDto;
  onRefreshLinks: () => void;
}) {
  const report = findCalculationReport(job.kind, job.input.reportType);
  if (!report) return null;
  const files = requestedCalculationReports(job);
  return (
    <section aria-labelledby="requested-report-heading" className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 id="requested-report-heading" className="text-xl font-semibold">Выбранный отчёт: {report.title}</h2>
      <p className="text-sm text-muted-foreground">{report.description}</p>
      {files.length > 0 ? (
        <div className={files.length > 1 ? "grid gap-4 md:grid-cols-2" : "space-y-4"}>
          {files.map(({ file, title, description }) => <CalculationImagePreview key={file.id} file={file} alt={title} caption={title} description={description} onRefreshLinks={onRefreshLinks} />)}
        </div>
      ) : job.status === "succeeded" ? (
        <p role="alert" className="text-sm text-status-failed">Выбранный отчёт отсутствует среди результатов или не подтверждён паспортом и контрольными суммами. Проверьте журнал расчёта и список файлов; подробное окно может не покрываться сеткой.</p>
      ) : job.status === "queued" || job.status === "running" ? (
        <p role="status" className="text-sm text-muted-foreground">SVG появится после завершения расчёта.</p>
      ) : job.status === "cancelled" ? (
        <p className="text-sm text-muted-foreground">Расчёт отменён. Выбранный SVG не сформирован.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Расчёт завершён с ошибкой. Выбранный SVG не сформирован.</p>
      )}
    </section>
  );
}
