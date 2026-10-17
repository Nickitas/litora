import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CalculationJobDto, ScientificInputDto } from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/shadcn/components/ui/select";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function reportFrom(job: CalculationJobDto): Record<string, unknown> | null {
  const metrics = record(record(job.resultSummary)?.metrics);
  const report = record(metrics?.["shoreline-data-audit.json"]);
  return report?.schemaVersion === 1 || report?.schemaVersion === 2 || report?.schemaVersion === 3 ? report : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function date(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "не указана";
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });
}

export function ShorelineDataAudit({ observationsInputId, inputs }: {
  observationsInputId: string;
  inputs: ScientificInputDto[];
}) {
  const [waveInputId, setWaveInputId] = useState("none");
  const [validationStart, setValidationStart] = useState("");
  const [job, setJob] = useState<CalculationJobDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const waves = inputs.filter((item) => item.role === "wave_climate" && item.status === "ready");

  useEffect(() => {
    let active = true;
    void api.calculationPage({ kind: "shoreline_data_audit", limit: 50 }).then(async (page) => {
      const recent = page.items.find((item) => item.input.observationsInputId === observationsInputId);
      if (recent) {
        const complete = await api.calculation(recent.id);
        if (active) {
          setJob((current) => current ?? complete);
          if (typeof complete.input.validationStart === "string") setValidationStart(complete.input.validationStart);
          if (typeof complete.input.waveInputId === "string") setWaveInputId(complete.input.waveInputId);
        }
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить историю аудита");
    }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [observationsInputId]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void api.calculation(job.id).then((result) => {
        if (active) { setJob(result); setError(""); }
      }).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Не удалось обновить аудит");
      });
    }, 4000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [job]);

  async function start() {
    setCreating(true);
    setError("");
    try {
      const result = await api.createCalculation({
        kind: "shoreline_data_audit",
        input: { observationsInputId, ...(waveInputId === "none" ? {} : { waveInputId }),
          ...(validationStart ? { validationStart } : {}) },
      });
      setJob(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось запустить аудит");
    } finally {
      setCreating(false);
    }
  }

  const report = job ? reportFrom(job) : null;
  const years = Array.isArray(report?.years)
    ? report.years.map(record).filter((item): item is Record<string, unknown> => item !== null) : [];
  const gaps = years.filter((item) => number(item.count) === 0).map((item) => number(item.year));
  const waveReport = record(report?.waves);
  const split = record(report?.temporalSplit);
  const pilot = record(report?.pilotCoverage);
  const pilotYears = Array.isArray(pilot?.years)
    ? pilot.years.map(record).filter((item): item is Record<string, unknown> => item !== null) : [];
  const pilotYearLabels = pilotYears.filter((item) => (number(item.count) ?? 0) > 0)
    .map((item) => `${number(item.year)} (${number(item.count)})`);
  const limitations = Array.isArray(report?.limitations)
    ? report.limitations.filter((item): item is string => typeof item === "string") : [];

  return <section className="space-y-3 rounded-lg border bg-muted/30 p-4" aria-labelledby="shoreline-audit-heading">
    <div>
      <h3 id="shoreline-audit-heading" className="font-semibold">Проверка исторического ряда</h3>
      <p className="text-sm text-muted-foreground">Go проверит пробелы по годам, качество датированных контуров и, если выбран ряд волн, его временное покрытие. Проверка не рассчитывает прогноз.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-52 space-y-1">
        <Label htmlFor="shoreline-audit-wave">Волновой ряд для проверки (необязательно)</Label>
        <Select value={waveInputId} onValueChange={setWaveInputId}>
          <SelectTrigger id="shoreline-audit-wave"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без волнового ряда</SelectItem>
            {waves.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.source}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="shoreline-audit-validation-start">Начало отложенной проверки UTC (необязательно)</Label>
        <Input id="shoreline-audit-validation-start" type="date" className="w-48"
          value={validationStart} onChange={(event) => setValidationStart(event.target.value)} />
      </div>
      <Button type="button" className="min-w-52" onClick={() => void start()} disabled={historyLoading || creating || job?.status === "queued" || job?.status === "running"}>
        {historyLoading ? "Ищем прошлую проверку…" : creating ? "Создаём задание…" : "Проверить данные"}
      </Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {job && <p role="status" className="text-sm">
      Аудит: {job.status === "queued" ? "в очереди" : job.status === "running" ? "выполняется" : job.status === "succeeded" ? "завершён" : job.status === "failed" ? "ошибка" : "отменён"}.{" "}
      <Link className="underline underline-offset-2" to={`/account/calculations/${job.id}`}>Открыть задание и файлы</Link>
    </p>}
    {job?.status === "failed" && job.errorMessage && <p role="alert" className="text-sm text-destructive">{job.errorMessage}</p>}
    {job?.status === "succeeded" && !report && <p className="text-sm text-muted-foreground">Отчёт доступен в файлах задания; сводка не загружена.</p>}
    {report && <div className="space-y-3 text-sm">
      {split && <div className="rounded-lg border bg-card p-3">
        <p className="font-medium">Временное разделение для будущей проверки модели</p>
        <p>До {date(split.validationStart)}: {number(split.trainingCount) ?? "—"} контуров; с этой даты: {number(split.validationCount) ?? "—"} контуров.</p>
        <p className="text-muted-foreground">Последнее раннее наблюдение: {date(split.trainingLastTime)}. Первое отложенное: {date(split.validationFirstTime)}. Промежуток: {number(split.boundaryGapDays)?.toFixed(1) ?? "—"} суток.</p>
      </div>}
      {pilot && <div className="space-y-2 rounded-lg border bg-card p-3">
        <p className="font-medium">Покрытие пилотного участка Сочи</p>
        <p>Пересекают стартовую рамку: {number(pilot.intersectingCount) ?? "—"} из {number(report.observationCount) ?? "—"} контуров. Вне рамки: {number(pilot.outsideCount) ?? "—"}; геометрия не проверена: {number(pilot.unknownGeometryCount) ?? "—"}.</p>
        <p>Годы с контурами в рамке: {pilotYearLabels.length ? pilotYearLabels.join(", ") : "нет"}.</p>
        <p className="text-muted-foreground">Рамка — только начальная область поиска данных. Пересечение не подтверждает качество линии, поправку уровня воды или пригодность для прогноза.</p>
      </div>}
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-muted-foreground">Контуров</dt><dd className="font-medium">{number(report.observationCount) ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Период UTC</dt><dd className="font-medium">{date(report.firstObservation)} — {date(report.lastObservation)}</dd></div>
        <div><dt className="text-muted-foreground">Наибольший пробел</dt><dd className="font-medium">{number(report.longestObservationGapDays)?.toFixed(1) ?? "—"} суток</dd></div>
        <div><dt className="text-muted-foreground">Годы без снимков</dt><dd className="font-medium">{gaps.length ? gaps.join(", ") : "нет в пределах ряда"}</dd></div>
        <div><dt className="text-muted-foreground">Без оценки неопределённости</dt><dd className="font-medium">{number(report.missingUncertaintyCount) ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Без показателя геопривязки</dt><dd className="font-medium">{number(report.missingGeoAccuracyCount) ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Без сведений о поправке уровня воды</dt><dd className="font-medium">{number(report.unknownTideStatusCount) ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Без поправки уровня воды</dt><dd className="font-medium">{number(report.uncorrectedTideCount) ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Непокрыто волнами</dt><dd className="font-medium">{number(waveReport?.missingObservationHours)?.toFixed(1) ?? "неизвестно"} ч</dd></div>
      </dl>
      {limitations.length > 0 && <div><p className="font-medium">Ограничения данных</p><ul className="list-disc pl-5 text-muted-foreground">{limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    </div>}
  </section>;
}
