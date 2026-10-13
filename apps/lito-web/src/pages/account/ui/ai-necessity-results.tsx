function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function nonnegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

interface AINecessitySummary {
  recommended: boolean;
  ratingCount: number;
  trainingCount: number;
  evaluationCount: number;
  baselineRMSE: number | null;
  candidateRMSE: number | null;
  improvement: number | null;
  reasons: string[];
}

function parseSummary(summary: Record<string, unknown> | null): AINecessitySummary | null {
  const metrics = record(summary?.metrics);
  const report = record(metrics?.["ai-necessity.json"]);
  const decision = record(report?.decision);
  const ratingCount = nonnegativeNumber(report?.rating_row_count);
  const trainingCount = nonnegativeNumber(decision?.training_record_count);
  const evaluationCount = nonnegativeNumber(decision?.evaluation_record_count);
  if (typeof decision?.ml_recommended !== "boolean" || ratingCount === null ||
      trainingCount === null || evaluationCount === null) return null;
  const baseline = record(decision.baseline_evaluation);
  const candidate = record(decision.candidate_evaluation);
  const baselineRMSE = baseline?.available === true ? nonnegativeNumber(baseline.rmse) : null;
  const candidateRMSE = candidate?.available === true ? nonnegativeNumber(candidate.rmse) : null;
  const improvement = baselineRMSE !== null && candidateRMSE !== null &&
    typeof decision.rmse_improvement === "number" && Number.isFinite(decision.rmse_improvement)
    ? decision.rmse_improvement : null;
  return {
    recommended: decision.ml_recommended, ratingCount, trainingCount, evaluationCount,
    baselineRMSE, candidateRMSE, improvement,
    reasons: Array.isArray(decision.reasons) && decision.reasons.every((item) => typeof item === "string")
      ? decision.reasons : [],
  };
}

const scoreFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
const percentFormat = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

export function AINecessityResults({ summary }: { summary: Record<string, unknown> | null }) {
  const result = parseSummary(summary);

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 text-card-foreground"
      aria-labelledby="ai-necessity-results-heading">
      <h2 id="ai-necessity-results-heading" className="text-xl font-semibold">Оценка необходимости ML · AI-02</h2>
      {result ? (
        <>
          <p className="text-sm font-medium">{result.recommended ? "ML рекомендуется для дальнейшего исследования" : "ML не рекомендуется по заданным критериям"}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Строк оценок</dt><dd>{result.ratingCount}</dd></div>
            <div><dt className="text-muted-foreground">Карточек обучения / проверки</dt><dd>{result.trainingCount} / {result.evaluationCount}</dd></div>
            {result.baselineRMSE !== null && <div><dt className="text-muted-foreground">RMSE базы</dt><dd>{scoreFormat.format(result.baselineRMSE)}</dd></div>}
            {result.candidateRMSE !== null && <div><dt className="text-muted-foreground">RMSE ridge-кандидата</dt><dd>{scoreFormat.format(result.candidateRMSE)}</dd></div>}
            {result.improvement !== null && <div><dt className="text-muted-foreground">Улучшение RMSE</dt><dd>{percentFormat.format(result.improvement)}</dd></div>}
          </dl>
          {result.reasons.length > 0 && <div className="text-sm"><h3 className="font-medium">Причины вывода</h3><ul className="list-disc pl-5">{result.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul></div>}
          <p className="text-xs text-muted-foreground">Значения показаны из отчёта Go без пересчёта в браузере. Это решение о необходимости исследования, не аттестованная ML-модель.</p>
        </>
      ) : <p className="text-sm text-muted-foreground">Краткая сводка недоступна. Проверьте полный файл ai-necessity.json в артефактах расчёта.</p>}
    </section>
  );
}
