import { calculationNumericParameters, cercSiteParameterNames } from "@litora/contracts";
import type { CalculationKind } from "@litora/contracts";
import { Label } from "@/shared/shadcn/components/ui/label";
import type { CalibrationFormValues, CercFormValues } from "../model/calculation-form-parameters";
import { numericInputValue } from "../model/calculation-form-parameters";
import { NumericCalculationInput } from "./numeric-calculation-input";

export function CercSiteParameters({ kind, values, prefix, formId, onChange }: {
  kind: Extract<CalculationKind, "erosion_file" | "all_file" | "calibrate_cerc">;
  values: CercFormValues | CalibrationFormValues;
  prefix: string;
  formId?: string;
  onChange: (patch: CercFormValues) => void;
}) {
  const definitions = calculationNumericParameters[kind];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Параметры участка заполняются по вашим данным. Без обоснования и независимой проверки результат не является прогнозом.
        Пустое значение не заменяется нулём или типовым числом.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {cercSiteParameterNames.filter((key) => definitions?.[key]).map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`${prefix}-${key}`}>{definitions?.[key]?.label}</Label>
            <NumericCalculationInput kind={kind} parameter={key} id={`${prefix}-${key}`} form={formId}
              value={values[key as keyof typeof values]}
              onChange={(event) => onChange({ [key]: numericInputValue(event.target.value) })} />
          </div>
        ))}
      </div>
    </div>
  );
}
