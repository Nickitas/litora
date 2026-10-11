function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface CalibrationRow {
  coefficient: number;
  rmse: number;
  mae: number;
  mbe: number;
  rSquared: number;
  count: number;
}

function calibrationRows(summary: Record<string, unknown> | null): CalibrationRow[] | null {
  const metrics = record(summary?.metrics);
  const report = record(metrics?.["cerc-calibration.json"]);
  if (!Array.isArray(report?.results) || report.results.length === 0 || report.results.length > 8)
    return null;
  const rows: CalibrationRow[] = [];
  for (const value of report.results) {
    const result = record(value);
    const scores = record(result?.metrics);
    const coefficient = finiteNumber(result?.cerc_coefficient);
    const rmse = finiteNumber(scores?.rmse_m_per_year);
    const mae = finiteNumber(scores?.mae_m_per_year);
    const mbe = finiteNumber(scores?.mbe_m_per_year);
    const rSquared = finiteNumber(scores?.r_squared);
    const count = finiteNumber(scores?.count);
    if (coefficient === null || rmse === null || mae === null || mbe === null ||
        rSquared === null || count === null || !Number.isInteger(count) || count < 0)
      return null;
    rows.push({ coefficient, rmse, mae, mbe, rSquared, count });
  }
  return rows;
}

const scoreFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });

export function CercCalibrationResults({ summary }: { summary: Record<string, unknown> | null }) {
  const rows = calibrationRows(summary);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 text-card-foreground"
      aria-labelledby="cerc-calibration-results-heading">
      <h2 id="cerc-calibration-results-heading" className="text-xl font-semibold">Рейтинг коэффициентов CERC</h2>
      {rows ? (
        <>
          <p className="text-sm text-muted-foreground">
            Порядок и показатели перенесены из отчёта Go без пересчёта в браузере.
          </p>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2">Ранг</th>
                  <th scope="col" className="p-2">CERC</th>
                  <th scope="col" className="p-2">RMSE, м/год</th>
                  <th scope="col" className="p-2">MAE, м/год</th>
                  <th scope="col" className="p-2">MBE, м/год</th>
                  <th scope="col" className="p-2">R²</th>
                  <th scope="col" className="p-2">Точек</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.coefficient}-${index}`} className="border-b last:border-0">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2">{row.coefficient}</td>
                    <td className="p-2">{scoreFormat.format(row.rmse)}</td>
                    <td className="p-2">{scoreFormat.format(row.mae)}</td>
                    <td className="p-2">{scoreFormat.format(row.mbe)}</td>
                    <td className="p-2">{scoreFormat.format(row.rSquared)}</td>
                    <td className="p-2">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Табличная сводка недоступна: отчёт слишком велик или имеет другую схему.
          Полный результат сохранён в файле cerc-calibration.json ниже.
        </p>
      )}
    </section>
  );
}
