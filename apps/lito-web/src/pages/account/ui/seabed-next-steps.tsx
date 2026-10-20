import type { CalculationJobDto, CalculationKindDto } from "@litora/contracts";
import { Link } from "react-router-dom";
import { Button } from "@/shared/shadcn/components/ui/button";
import { seabedWorkflows, seabedWorkflowUrl, type SeabedWorkflowId } from "../model/seabed-workflows";

export function SeabedNextSteps({ job, kinds }: { job: CalculationJobDto; kinds: CalculationKindDto[] }) {
  if (job.status !== "succeeded" || job.deletionRequestedAt) return null;
  const next: SeabedWorkflowId[] = job.kind === "mesh" || job.kind === "seabed_generate_adaptive"
    ? ["build"] : job.kind === "seabed_build" ? ["bathymetry", "size-field", "mesh-fragments"]
      : job.kind === "seabed_render" ? ["size-field"] : job.kind === "seabed_adapt" ? ["bathymetry", "mesh-fragments"] : [];
  if (!next.length) return null;
  return (
    <section aria-labelledby="seabed-next-heading" className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 id="seabed-next-heading" className="text-xl font-semibold">Продолжить работу с сеткой</h2>
      <p className="text-sm text-muted-foreground">Откроется новая форма с совместимыми файлами этого расчёта. Проверьте входы и параметры перед запуском.</p>
      <div className="flex flex-wrap gap-2">
        {next.map((id) => {
          const item = seabedWorkflows.find((entry) => entry.id === id)!;
          return kinds.some((entry) => entry.kind === item.kind)
            ? <Button key={id} asChild variant="outline" className="h-auto min-h-11 whitespace-normal text-left"><Link to={seabedWorkflowUrl(id, job.id)}>{item.title}</Link></Button>
            : <p key={id} className="text-sm text-muted-foreground">{item.title} — расчёт отключён на сервере.</p>;
        })}
      </div>
    </section>
  );
}
