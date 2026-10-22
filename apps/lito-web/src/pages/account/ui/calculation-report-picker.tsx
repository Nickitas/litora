import { Label } from "@/shared/shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/shadcn/components/ui/select";

interface ReportOption {
  type: string;
  title: string;
  description: string;
  figure: string;
  disabled?: boolean;
}

export function CalculationReportPicker({ id, label = "Подтип отчёта", options, value, disabled, onChange }: {
  id: string;
  label?: string;
  options: readonly ReportOption[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.type === value);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} disabled={disabled} onValueChange={(next) => {
        if (options.some((option) => option.type === next && !option.disabled)) onChange(next);
      }}>
        <SelectTrigger id={id} aria-describedby={`${id}-description`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.type} value={option.type} disabled={option.disabled}>
            {option.title}{option.disabled ? " · недоступен" : ""}
          </SelectItem>)}
        </SelectContent>
      </Select>
      {selected && <p id={`${id}-description`} className="text-sm text-muted-foreground">{selected.description} {selected.figure} из примеров; результат строится на ваших входных данных.</p>}
    </div>
  );
}
