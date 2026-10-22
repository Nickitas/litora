import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import type { CalibrationFormValues } from "../model/calculation-form-parameters";
import { numericInputValue } from "../model/calculation-form-parameters";
import { CercSiteParameters } from "./cerc-site-parameters";
import { NumericCalculationInput } from "./numeric-calculation-input";
import { CalculationParameterHint } from "./calculation-parameter-hint";

export function CercCalibrationFields({ options, resolution, onOptionsChange, onResolutionChange, formId }: {
  options: CalibrationFormValues;
  resolution: string;
  onOptionsChange: (patch: Partial<CalibrationFormValues>) => void;
  onResolutionChange: (value: string) => void;
  formId?: string;
}) {
  return (
    <section aria-labelledby="calibration-parameters-heading" className="space-y-4">
      <h4 id="calibration-parameters-heading" className="text-lg font-semibold">Параметры калибровки</h4>
      <p className="text-sm text-muted-foreground">
        Нужны независимые наблюдения годовой скорости и фактический волновой ряд не короче 8766 часов.
        Подбор коэффициента сам по себе не подтверждает прогноз.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calibration-resolution">Фактический шаг батиметрии, градусы</Label>
          <NumericCalculationInput kind="calibrate_cerc" parameter="bathymetryResolution" form={formId} id="calibration-resolution"
            value={resolution} onChange={(event) => onResolutionChange(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calibration-coefficients">Коэффициенты CERC (1–8 через запятую)</Label>
          <Input form={formId} id="calibration-coefficients" required maxLength={96} value={options.cercCoefficients}
            aria-describedby="calibration-coefficients-hint" onChange={(event) => onOptionsChange({ cercCoefficients: event.target.value })} />
          <CalculationParameterHint kind="calibrate_cerc" parameter="cercCoefficients" inputId="calibration-coefficients" />
        </div>
        {(["maxObservationDistance", "minWaveHours"] as const).map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`calibration-${key}`}>{key === "minWaveHours" ? "Минимальное покрытие волнового ряда, ч" : "Максимальная дистанция наблюдения до берега, м"}</Label>
            <NumericCalculationInput kind="calibrate_cerc" parameter={key} form={formId} id={`calibration-${key}`} value={options[key]}
              onChange={(event) => onOptionsChange({ [key]: numericInputValue(event.target.value) })} />
          </div>
        ))}
      </div>
      <CercSiteParameters kind="calibrate_cerc" values={options} prefix="calibration" formId={formId} onChange={onOptionsChange} />
    </section>
  );
}
