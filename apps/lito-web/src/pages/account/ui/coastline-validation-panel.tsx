import { Link } from "react-router-dom";
import type { CoastlineValidationDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  validationPassed,
  validationPending,
  validationTitle,
  type useCoastlineValidation,
} from "../model/use-coastline-validation";

export function CoastlineValidationSummary({
  value,
}: {
  value?: CoastlineValidationDto;
}) {
  return (
    <p
      className={`mt-3 text-sm ${validationPassed(value) ? "text-status-succeeded" : value?.status === "failed" ? "text-status-failed" : "text-muted-foreground"}`}
    >
      {validationTitle(value)}
    </p>
  );
}

export function CoastlineValidationPanel({
  check,
}: {
  check: ReturnType<typeof useCoastlineValidation>;
}) {
  const { state, error, requesting, refresh, start } = check;
  const pending = validationPending(state);
  return (
    <section
      aria-label="Проверка геометрии береговой линии"
      className="space-y-3 rounded-xl border bg-card p-4 text-sm"
    >
      <p role="status" className="font-medium">
        {validationTitle(state)}
      </p>
      <p className="text-xs text-muted-foreground">
        Go проверяет исходную геометрию. Успех не подтверждает точность съёмки
        или пригодность для прогноза.
      </p>
      {state?.message && (
        <p className="text-muted-foreground">{state.message}</p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {Boolean(state?.issues.length) && (
        <ul
          aria-label="Замечания проверки"
          className="max-h-64 space-y-2 overflow-auto rounded-lg border p-3"
        >
          {state!.issues.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className={
                issue.severity === "error"
                  ? "text-status-failed"
                  : "text-muted-foreground"
              }
            >
              <span className="font-medium">
                {issue.severity === "error" ? "Ошибка" : "Предупреждение"}:{" "}
              </span>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {state?.truncated && (
        <p>
          Достигнут предел отчёта или объёма проверки. Весь исходник нельзя
          считать проверенным; разделите его на участки.
        </p>
      )}
      {state?.methodId && (
        <p className="text-xs break-words text-muted-foreground">
          Метод: {state.methodId} · ревизия {state.methodRevision}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!pending && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={requesting}
            onClick={() => void start()}
          >
            {requesting
              ? "Ставим в очередь…"
              : validationPassed(state)
                ? "Проверить снова"
                : "Запустить проверку"}
          </Button>
        )}
        {error && (
          <Button type="button" size="sm" variant="outline" onClick={refresh}>
            Обновить состояние
          </Button>
        )}
        {state?.jobId && (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/lab/calculations/${state.jobId}`}>Журнал проверки</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
