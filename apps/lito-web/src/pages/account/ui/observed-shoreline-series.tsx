import { lazy, Suspense, useEffect, useState } from "react";
import type { ObservedShorelineSeriesDto, ScientificInputDto } from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/shadcn/components/ui/select";
import { Slider } from "@/shared/shadcn/components/ui/slider";
import { periodLabel, periodStart, shiftPeriod, type ShorelineTimeUnit } from "../model/shoreline-time";
import { ScientificInputUpload } from "./scientific-input-upload";
import { ShorelineYearNavigator } from "./shoreline-year-navigator";
import { ShorelineDataAudit } from "./shoreline-data-audit";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});
const units: { value: ShorelineTimeUnit; label: string }[] = [
  { value: "year", label: "Год" },
  { value: "month", label: "Месяц" },
  { value: "week", label: "Неделя" },
  { value: "day", label: "День" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось загрузить наблюдения";
}

const ObservationMap = lazy(() => import("./observation-map"));

export function ObservedShorelineSeries() {
  const [inputs, setInputs] = useState<ScientificInputDto[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [series, setSeries] = useState<ObservedShorelineSeriesDto | null>(null);
  const [seriesError, setSeriesError] = useState("");
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [unit, setUnit] = useState<ShorelineTimeUnit>("year");
  const [anchor, setAnchor] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    api.scientificInputs().then((result) => {
      if (!active) return;
      const ready = result.filter((item) => item.role === "shoreline_timeseries_geojson" && item.status === "ready");
      setInputs(result);
      setSelectedId((current) => current || ready[0]?.id || "");
      setListError("");
    }).catch((error: unknown) => {
      if (active) setListError(errorMessage(error));
    }).finally(() => {
      if (active) setListLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    let active = true;
    if (!selectedId) return () => { active = false; };
    api.shorelineObservationSeries(selectedId).then((result) => {
      if (!active) return;
      setSeries(result);
      setPosition(result.frames.length - 1);
      setAnchor(new Date(result.frames.at(-1)?.time ?? 0));
      setSeriesError("");
    }).catch((error: unknown) => {
      if (active) setSeriesError(errorMessage(error));
    }).finally(() => { if (active) setSeriesLoading(false); });
    return () => { active = false; };
  }, [selectedId, reload]);

  useEffect(() => {
    if (!playing || !series) return;
    const timer = window.setTimeout(() => {
      if (position >= series.frames.length - 1) {
        setPlaying(false);
        return;
      }
      const next = position + 1;
      setPosition(next);
      setAnchor(new Date(series.frames[next].time));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [playing, position, series]);

  function choose(position: number) {
    if (!series?.frames[position]) return;
    setPlaying(false);
    setPosition(position);
    setAnchor(new Date(series.frames[position].time));
  }

  function showPeriod(date: Date) {
    if (!series) return;
    const start = periodStart(date, unit).getTime();
    const end = shiftPeriod(date, unit, 1).getTime();
    let last = -1;
    series.frames.forEach((item, index) => {
      const time = Date.parse(item.time);
      if (time >= start && time < end) last = index;
    });
    setPlaying(false);
    setAnchor(date);
    if (last >= 0) setPosition(last);
  }

  const observedInputs = inputs.filter((item) => item.role === "shoreline_timeseries_geojson" && item.status === "ready");
  const selected = observedInputs.find((item) => item.id === selectedId);
  const frame = series?.frames[position];
  const from = periodStart(anchor, unit).getTime();
  const to = shiftPeriod(anchor, unit, 1).getTime();
  const periodFrames = series?.frames.filter((item) => {
    const time = Date.parse(item.time);
    return time >= from && time < to;
  }) ?? [];
  const visiblePeriodFrames = periodFrames.length <= 60
    ? periodFrames
    : periodFrames.filter((item, index) =>
        index < 25 || index >= periodFrames.length - 25 || item === frame);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4" aria-labelledby="observed-shoreline-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="observed-shoreline-heading" className="text-xl font-semibold">Спутниковые наблюдения</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Реплей датированных контуров из GeoJSON, в том числе экспорта CoastSat. Каждая линия соответствует снимку;
            между снимками положение берега неизвестно.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setUploadOpen((value) => !value)}>
          {uploadOpen ? "Закрыть загрузку" : "Загрузить ряд GeoJSON"}
        </Button>
      </div>
      {uploadOpen && <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          CoastSat запускается отдельно от Litora. Экспортируйте из него линии с полями date и satname;
          cloud_cover и geoaccuracy будут показаны, если есть. Преобразуйте GeoJSON в EPSG:4326.
          Допустимы 2–2500 дат и файл до 16 МиБ.
        </p>
        <ScientificInputUpload role="shoreline_timeseries_geojson"
          onSaved={(value) => {
            setUploadOpen(false);
            setSelectedId(value.id);
            setListLoading(true);
            setSeriesLoading(true);
            setReload((current) => current + 1);
          }}
          onCancel={() => setUploadOpen(false)} />
      </div>}
      {listLoading ? <p role="status">Ищем наборы наблюдений…</p> : listError ? (
        <p role="alert" className="text-destructive">{listError}{" "}
          <Button variant="link" onClick={() => { setListLoading(true); setReload((value) => value + 1); }}>Повторить</Button>
        </p>
      ) : observedInputs.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Сохранённых рядов пока нет. Загрузите датированные наблюдения GeoJSON, чтобы увидеть изменения по датам.
        </p>
      ) : <>
        <div className="space-y-2">
          <Label htmlFor="observed-series">Набор наблюдений</Label>
          <Select value={selectedId} onValueChange={(value) => {
            setSelectedId(value); setSeries(null); setSeriesLoading(true); setPlaying(false);
          }}>
            <SelectTrigger id="observed-series"><SelectValue /></SelectTrigger>
            <SelectContent>{observedInputs.map((item) => <SelectItem key={item.id} value={item.id}>
              {item.name} · {item.source}
            </SelectItem>)}</SelectContent>
          </Select>
        </div>
        {selected && <p className="text-xs text-muted-foreground">
          Источник: {selected.source} · версия: {selected.sourceRevision ?? "не указана"} ·
          лицензия: {selected.license} · EPSG:4326 · SHA-256: {selected.sha256 ?? "нет"}
        </p>}
        {seriesLoading ? <p role="status">Загружаем контуры…</p> : seriesError ? (
          <p role="alert" className="text-destructive">{seriesError}{" "}
            <Button variant="link" onClick={() => { setSeriesLoading(true); setReload((value) => value + 1); }}>Повторить</Button>
          </p>
        ) : series && frame ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{dateTime.format(new Date(frame.time))} UTC</p>
              <p className="text-sm text-muted-foreground">
                Снимок {position + 1} из {series.frames.length} · {frame.satellite} ·
                облачность {frame.cloudCover === null ? "не указана" : `${Math.round(frame.cloudCover * 100)}%`} ·
                показатель геопривязки {frame.geoAccuracy ?? "не указан"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={position === 0} onClick={() => choose(position - 1)}>Предыдущий снимок</Button>
              <Button type="button" disabled={position >= series.frames.length - 1} onClick={() => choose(position + 1)}>Следующий снимок</Button>
              <Button type="button"
                disabled={window.matchMedia("(prefers-reduced-motion: reduce)").matches}
                onClick={() => {
                if (playing) setPlaying(false);
                else { if (position >= series.frames.length - 1) choose(0); setPlaying(true); }
              }}>{playing ? "Пауза" : "▶ Воспроизвести"}</Button>
            </div>
          </div>
          <Slider aria-label="Дата спутникового наблюдения" min={0} max={series.frames.length - 1}
            step={1} value={[position]} onValueChange={([value]) => choose(value)} />
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{dateTime.format(new Date(series.frames[0].time))} UTC</span>
            <span>{dateTime.format(new Date(series.frames.at(-1)!.time))} UTC</span>
          </div>
          <ShorelineYearNavigator frames={series.frames} selectedPosition={position}
            onSelectPosition={choose} label="Охват наблюдений по годам" />
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="space-y-1"><Label htmlFor="observation-time-unit">Масштаб времени</Label>
              <Select value={unit} onValueChange={(value) => setUnit(value as ShorelineTimeUnit)}>
                <SelectTrigger id="observation-time-unit" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{units.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <Button type="button" variant="outline" onClick={() => showPeriod(shiftPeriod(anchor, unit, -1))}>Предыдущий период</Button>
            <span className="pb-2 text-sm">{periodLabel(anchor, unit)} · снимков: {periodFrames.length}</span>
            <Button type="button" variant="outline" onClick={() => showPeriod(shiftPeriod(anchor, unit, 1))}>Следующий период</Button>
            <div className="space-y-1"><Label htmlFor="observation-date">Перейти к дате UTC</Label>
              <Input id="observation-date" type="date" className="w-44"
                onChange={(event) => {
                  const date = new Date(`${event.target.value}T00:00:00Z`);
                  if (Number.isFinite(date.getTime())) showPeriod(date);
                }} /></div>
          </div>
          {periodFrames.length === 0 ? <p role="status" className="text-sm text-muted-foreground">
            В этом периоде снимков нет; показан последний выбранный контур.
          </p> : <div className="flex flex-wrap gap-1" aria-label="Снимки выбранного периода">
            {visiblePeriodFrames.map((item) => {
              const index = series.frames.indexOf(item);
              return <Button key={item.time} type="button" size="sm"
                variant={index === position ? "default" : "outline"} onClick={() => choose(index)}>
                {dateTime.format(new Date(item.time))}
              </Button>;
            })}
          </div>}
          {periodFrames.length > visiblePeriodFrames.length && <p className="text-xs text-muted-foreground">
            Показано {visiblePeriodFrames.length} из {periodFrames.length} дат периода;
            любой снимок доступен через общий ползунок.
          </p>}
          <Suspense fallback={<p role="status">Загружаем карту…</p>}>
            <ObservationMap key={selectedId} series={series} position={position} />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            При экспорте из CoastSat линия обычно описывает границу песка и воды. Приливы, волны,
            облака и качество геопривязки влияют на её положение; показанные контуры не являются
            непрерывным мониторингом или прогнозом эрозии. Смысл geoaccuracy уточняйте у источника;
            это поле не заменяет неопределённость положения линии. Сведения о поправке уровня воды
            пока не входят в контракт карты, поэтому сравнение разных дат требует проверки исходного ряда.
          </p>
        </> : null}
        {selected && <ShorelineDataAudit key={selected.id} observationsInputId={selected.id} inputs={inputs} />}
      </>}
    </section>
  );
}
