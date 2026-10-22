import { CalculationFormSection } from "./calculation-form-section";

export function CalculationResultSection({ title, description, issues }: {
  title: string;
  description?: string;
  issues: string[];
}) {
  return (
    <CalculationFormSection id="calculation-result" step={4} title="Результат">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <p className="text-sm text-muted-foreground">
        После запуска откроется страница задания: ход выполнения, отчёты и готовые файлы.
        Результаты можно скачать после завершения расчёта.
      </p>
      <div id="calculation-readiness" role="status" className="rounded-lg border bg-muted/35 p-4 text-sm">
        {issues.length > 0 ? (
          <>
            <p className="font-medium">Перед запуском</p>
            <ul className="mt-2 list-disc space-y-1 break-words pl-5">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </>
        ) : (
          <p>Обязательные входы выбраны. Проверьте параметры перед запуском.</p>
        )}
      </div>
    </CalculationFormSection>
  );
}
