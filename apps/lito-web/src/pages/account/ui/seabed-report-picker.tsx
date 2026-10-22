import { seabedReports, type CalculationKindDto, type SeabedReportType } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import { CalculationReportPicker } from "./calculation-report-picker";
import type { SeabedWorkflowId } from "../model/seabed-workflows";

export function SeabedReportPicker({ value, kinds, disabled, onChange, onPrepare }: {
  value: SeabedReportType;
  kinds: CalculationKindDto[];
  disabled: boolean;
  onChange: (value: SeabedReportType) => void;
  onPrepare: (workflow: SeabedWorkflowId) => void;
}) {
  const report = seabedReports.find((item) => item.type === value)!;
  const available = (kind: string) => kinds.some((item) => item.kind === kind && item.available !== false);
  return (
    <div className="mt-4 space-y-3">
      <CalculationReportPicker id="seabed-report-type" value={value} disabled={disabled}
        options={seabedReports.map((item) => ({ ...item, disabled: !available(item.kind) }))}
        onChange={(next) => {
          const item = seabedReports.find((item) => item.type === next);
          if (item) onChange(item.type);
        }} />
      <p className="text-sm text-muted-foreground">{report.kind === "seabed_render"
        ? "Нужна принятая модель дна MSH с глубинами, паспорт экспорта и паспорт источника батиметрии."
        : "Нужна принятая модель дна MSH с глубинами и паспорт источника батиметрии."}</p>
      <details className="rounded-lg border bg-muted/20 p-3 text-sm">
        <summary className="min-h-8 cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Подготовить модель дна</summary>
        <p className="mt-2 text-muted-foreground">Сначала постройте плоскую сетку по контуру моря, затем назначьте глубины из реального набора GEBCO с паспортом.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={disabled || !available("mesh")} className="h-auto min-h-11 whitespace-normal text-left" onClick={() => onPrepare("mesh")}>Построить плоскую сетку</Button>
          <Button type="button" variant="outline" disabled={disabled || !available("seabed_build")} className="h-auto min-h-11 whitespace-normal text-left" onClick={() => onPrepare("build")}>Назначить глубины сетке</Button>
        </div>
      </details>
    </div>
  );
}
