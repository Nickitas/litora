import type { CercCalibrationOptionsDto } from "@litora/contracts";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";

type Parameters = Omit<CercCalibrationOptionsDto, "bathymetryResolution">;

const numericalFields = [
  ["maxObservationDistance", "Максимальная дистанция наблюдения до берега, м", 1, 100000],
  ["minWaveHours", "Минимальное покрытие волнового ряда, ч", 8766, 100000],
  ["breakingIndex", "Индекс разрушения волн", 0.55, 1.2],
  ["bermHeight", "Высота бермы, м", 0.001, 100],
  ["closureDepth", "Глубина замыкания, м", 0.001, 1000],
  ["porosity", "Пористость наносов", 0.000001, 0.699999],
  ["offshoreSampleDistance", "Расстояние отбора глубины, м", 1, 100000],
  ["maxBathymetryGap", "Радиус поиска глубины, м", 1, 100000],
  ["leftBoundaryTransport", "Поток через левую границу, м³/с", -1000000, 1000000],
  ["rightBoundaryTransport", "Поток через правую границу, м³/с", -1000000, 1000000],
] as const;

export function CercCalibrationFields({
  options, resolution, onOptionsChange, onResolutionChange,
}: {
  options: Parameters;
  resolution: string;
  onOptionsChange: (patch: Partial<Parameters>) => void;
  onResolutionChange: (value: string) => void;
}) {
  return (
    <section aria-labelledby="calibration-parameters-heading" className="space-y-4 border-t pt-6">
      <h3 id="calibration-parameters-heading" className="text-lg font-semibold">2. Параметры калибровки</h3>
      <p className="text-sm text-muted-foreground">
        Нужны независимые наблюдения годовой скорости и фактический волновой ряд не короче 8766 часов.
        Go проверит данные; подбор коэффициента сам по себе не подтверждает прогноз.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calibration-resolution">Фактический шаг батиметрии, градусы</Label>
          <Input id="calibration-resolution" type="number" min={0.000000001} max={1} step="any" required
            value={resolution} onChange={(event) => onResolutionChange(event.target.value)} />
          <p className="text-xs text-muted-foreground">Возьмите значение из паспорта батиметрии; Go проверит совпадение.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calibration-coefficients">Коэффициенты CERC (1–8 через запятую)</Label>
          <Input id="calibration-coefficients" required maxLength={96} value={options.cercCoefficients}
            onChange={(event) => onOptionsChange({ cercCoefficients: event.target.value })} />
        </div>
        {numericalFields.map(([key, label, min, max]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`calibration-${key}`}>{label}</Label>
            <Input id={`calibration-${key}`} type="number" min={min} max={max} step="any" required
              value={options[key]} onChange={(event) => onOptionsChange({ [key]: Number(event.target.value) })} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Положительный поток через левую границу входит в сегмент, через правую — выходит.
        Нулевые значения оставьте, если измеренного граничного баланса нет.
      </p>
    </section>
  );
}
