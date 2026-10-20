import type { CalculationKindDto } from "@litora/contracts";
import { Link } from "react-router-dom";
import { Button } from "@/shared/shadcn/components/ui/button";
import { seabedWorkflows, type SeabedWorkflowId } from "../model/seabed-workflows";

export function SeabedWorkflowPicker({ kinds, onSelect }: {
  kinds: CalculationKindDto[];
  onSelect: (workflow: SeabedWorkflowId) => void;
}) {
  const available = new Set(kinds.map((item) => item.kind));
  return (
    <section aria-labelledby="seabed-workflows-heading" className="mt-5 space-y-3 rounded-xl border bg-muted/20 p-4">
      <h4 id="seabed-workflows-heading" className="font-semibold">Карты и сетки дна · рисунки 3–5</h4>
      <p className="text-sm text-muted-foreground">Для готовой модели MSH выберите результат. Обзор глубин и фрагменты фактической сетки создаются одним расчётом без повторного запуска Gmsh.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {seabedWorkflows.slice(0, 3).map((item) => (
          <div key={item.id} className="min-w-0 space-y-2 rounded-lg border bg-card p-3">
            <Button type="button" variant="outline" disabled={!available.has(item.kind)}
              className="h-auto min-h-11 w-full justify-start whitespace-normal text-left" onClick={() => onSelect(item.id)}>
              {item.title}
            </Button>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            {!available.has(item.kind) && <p className="text-xs text-muted-foreground">Расчёты дна отключены на сервере.</p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Нет модели дна? Сначала постройте плоскую сетку по контуру моря, затем назначьте глубины из GEBCO с проверяемым паспортом.</p>
      <div className="flex flex-wrap gap-2">
        {seabedWorkflows.slice(3).map((item) => (
          <Button key={item.id} type="button" variant="outline" disabled={!available.has(item.kind)}
            className="h-auto min-h-11 whitespace-normal text-left" onClick={() => onSelect(item.id)}>{item.title}</Button>
        ))}
        <Button asChild variant="link" className="h-auto min-h-11 whitespace-normal text-left">
          <Link to="/docs/reference/platform-integration.md" target="_blank" rel="noopener noreferrer">Данные и этапы расчёта<span className="sr-only"> (в новой вкладке)</span></Link>
        </Button>
      </div>
    </section>
  );
}
