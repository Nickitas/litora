import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  CalculationJobDto,
  CalculationKind,
  ShorelinePointSeriesDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";
import {
  loadShorelineDemoChunk,
  loadShorelineDemoPointSeries,
  shorelineDemoIndex,
} from "@litora/generated-data";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { DatePicker } from "@/shared/shadcn/components/ui/date-picker";
import { Label } from "@/shared/shadcn/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/components/ui/select";
import { Slider } from "@/shared/shadcn/components/ui/slider";
import { useInfiniteCalculationHistory } from "./model/use-calculations";
import {
  periodLabel,
  periodStart,
  shiftPeriod,
  type ShorelineTimeUnit,
} from "./model/shoreline-time";
import {
  ShorelineChangeChart,
  ShorelineMap,
  ShorelinePointTimelineChart,
  WaveTimelineChart,
} from "./ui/shoreline-visualization";
import { ObservedShorelineSeries } from "./ui/observed-shoreline-series";
import { ShorelineYearNavigator } from "./ui/shoreline-year-navigator";

type MapKind = Extract<CalculationKind, "erosion" | "erosion_file" | "all_demo" | "all_file">;
const mapKinds: { value: MapKind | "all"; label: string }[] = [
  { value: "all", label: "Все сценарии CERC" },
  { value: "erosion_file", label: "Эрозия · свои данные" },
  { value: "all_file", label: "Полный расчёт · свои данные" },
  { value: "erosion", label: "Эрозия · встроенные данные" },
  { value: "all_demo", label: "Полный расчёт · встроенные данные" },
];
const indexFilename = "erosion/visualization/index.json";
const units: { value: ShorelineTimeUnit; label: string }[] = [
  { value: "year", label: "Год" },
  { value: "month", label: "Месяц" },
  { value: "week", label: "Неделя" },
  { value: "day", label: "День" },
];
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const smallDistance = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 7,
});
const utcDateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function message(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось загрузить данные";
}

function jobTitle(kind: string) {
  if (kind === "erosion") return "Эрозия · демо";
  if (kind === "erosion_file") return "Эрозия · свои данные";
  if (kind === "all_demo") return "Полный расчёт · демо";
  return "Полный расчёт · свои данные";
}

function statusLabel(status: CalculationJobDto["status"]) {
  return {
    queued: "в очереди",
    running: "выполняется",
    succeeded: "завершён",
    failed: "ошибка",
    cancelled: "отменён",
  }[status];
}

function frameLabel(index: ShorelineVisualizationIndexDto, position: number) {
  const frame = index.frames[position];
  if (!frame) return "Нет состояния";
  if (!frame.time)
    return frame.index === 0 ? "Исходная линия" : `Шаг ${frame.index}`;
  return `${frame.index === 0 ? "Исходная линия" : `Шаг ${frame.index}`} · ${utcDateTime.format(new Date(frame.time))} UTC`;
}

export function ShorelineVisualizationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get("job") ?? "";
  const isDemo = !jobId;
  const [mapKind, setMapKind] = useState<MapKind | "all">("all");
  const mapQuery = `visualization=shoreline&status=succeeded&limit=20${mapKind === "all" ? "" : `&kind=${mapKind}`}`;
  const {
    jobs,
    nextCursor,
    totalCount,
    loading: listLoading,
    loadingMore,
    error: listError,
    loadMoreError,
    loadMore,
    reload: reloadList,
  } = useInfiniteCalculationHistory(mapQuery);
  const [revision, setRevision] = useState(0);
  const requestKey = isDemo ? "demo:sochi" : `${jobId}:${revision}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    job: CalculationJobDto | null;
    index: ShorelineVisualizationIndexDto | null;
    error: string;
  } | null>(null);
  const active = loaded?.key === requestKey ? loaded : null;
  const job = active?.job ?? null;
  const index = isDemo ? shorelineDemoIndex : (active?.index ?? null);
  const error = active?.error ?? "";
  const loading = Boolean(jobId && !active);
  const [unit, setUnit] = useState<ShorelineTimeUnit>("month");
  const [anchor, setAnchor] = useState(
    () => new Date(shorelineDemoIndex.frames[0].time ?? 0)
  );
  const [frameIndex, setFrameIndex] = useState<number | null>(0);
  const [selectedPoint, setSelectedPoint] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackDelay, setPlaybackDelay] = useState(1400);
  const [playbackStep, setPlaybackStep] = useState(24);
  const [viewRevision, setViewRevision] = useState(0);
  const [viewResult, setViewResult] = useState<{
    key: string;
    view: {
      initial: ShorelineVisualizationChunkDto["frames"][number];
      current: ShorelineVisualizationChunkDto["frames"][number];
    } | null;
    error: string;
  } | null>(null);
  const chunks = useRef(new Map<string, ShorelineVisualizationChunkDto>());
  const [seriesRevision, setSeriesRevision] = useState(0);
  const [seriesResult, setSeriesResult] = useState<{
    key: string;
    series: ShorelinePointSeriesDto | null;
    error: string;
  } | null>(null);
  const seriesCache = useRef(new Map<string, ShorelinePointSeriesDto>());

  useEffect(() => {
    if (jobId) return;
    const timer = window.setTimeout(() => {
      setFrameIndex(0);
      setAnchor(new Date(shorelineDemoIndex.frames[0].time ?? 0));
      setSelectedPoint(0);
      setPlaying(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [jobId]);

  useEffect(() => {
    let alive = true;
    chunks.current.clear();
    seriesCache.current.clear();
    if (!jobId)
      return () => {
        alive = false;
      };
    void api
      .calculation(jobId)
      .then(async (result) => {
        if (!alive) return;
        const visualization =
          result.status === "succeeded" &&
          result.artifacts.some(
            (file) =>
              file.filename === indexFilename && file.category === "output"
          )
            ? await api.shorelineVisualization(jobId)
            : null;
        if (!alive) return;
        setLoaded({
          key: requestKey,
          job: result,
          index: visualization,
          error: "",
        });
        if (visualization) {
          const last = visualization.frames.length - 1;
          setFrameIndex(last);
          setSelectedPoint(0);
          if (visualization.frames[last]?.time)
            setAnchor(new Date(visualization.frames[last].time));
        }
        setPlaying(false);
      })
      .catch((nextError: unknown) => {
        if (alive)
          setLoaded({
            key: requestKey,
            job: null,
            index: null,
            error: message(nextError),
          });
      });
    return () => {
      alive = false;
    };
  }, [jobId, requestKey]);

  const currentMeta = frameIndex === null ? null : index?.frames[frameIndex];
  const currentDurationHours = currentMeta?.durationHours ?? null;
  const viewKey = `${requestKey}:${currentMeta?.index ?? "none"}:${viewRevision}`;
  const activeView = viewResult?.key === viewKey ? viewResult : null;
  const view = activeView?.view ?? null;
  const viewError = activeView?.error ?? "";
  const viewLoading = Boolean(currentMeta && !activeView);
  const displayedView = view ?? (
    viewLoading && viewResult?.key.startsWith(`${requestKey}:`) ? viewResult.view : null
  );
  const displayedFrame = displayedView?.current ?? null;
  const displayedCell = displayedFrame?.cells.find((cell) => cell.pointIndex === selectedPoint);
  const displayedMeta = displayedFrame ? index?.frames[displayedFrame.index] : null;
  const seriesKey = `${requestKey}:${selectedPoint}:${seriesRevision}`;
  const activeSeries = seriesResult?.key === seriesKey ? seriesResult : null;
  const series = activeSeries?.series ?? null;
  const seriesError = activeSeries?.error ?? "";
  const seriesLoading = Boolean(index?.pointSeries && !activeSeries);
  useEffect(() => {
    let alive = true;
    if (!index || !currentMeta)
      return () => {
        alive = false;
      };
    const initialId = index.frames[0].chunkId;
    const load = async (id: string) => {
      const cacheKey = `${requestKey}:${id}`;
      const cached = chunks.current.get(cacheKey);
      if (cached) return cached;
      const result = isDemo
        ? await loadShorelineDemoChunk(id)
        : await api.shorelineVisualizationChunk(jobId, id);
      chunks.current.set(cacheKey, result);
      return result;
    };
    const initialChunk = load(initialId);
    void Promise.all([
      initialChunk,
      initialId === currentMeta.chunkId
        ? initialChunk
        : load(currentMeta.chunkId),
    ])
      .then(([initialChunk, currentChunk]) => {
        if (!alive) return;
        const initial = initialChunk.frames.find((frame) => frame.index === 0);
        const current = currentChunk.frames.find(
          (frame) => frame.index === currentMeta.index
        );
        if (!initial || !current)
          throw new Error("Кадры не соответствуют индексу визуализации");
        setViewResult({ key: viewKey, view: { initial, current }, error: "" });
      })
      .catch((nextError: unknown) => {
        if (alive) {
          setViewResult({
            key: viewKey,
            view: null,
            error: message(nextError),
          });
          setPlaying(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [jobId, isDemo, index, currentMeta, requestKey, viewKey]);

  useEffect(() => {
    let alive = true;
    if (!index?.pointSeries)
      return () => {
        alive = false;
      };
    const cacheKey = `${requestKey}:${selectedPoint}`;
    const cached = seriesCache.current.get(cacheKey);
    if (cached) {
      setSeriesResult({ key: seriesKey, series: cached, error: "" });
      return () => {
        alive = false;
      };
    }
    void (isDemo
      ? loadShorelineDemoPointSeries(selectedPoint)
      : api.shorelinePointSeries(jobId, selectedPoint))
      .then((result) => {
        if (!alive) return;
        if (seriesCache.current.size >= 8) {
          const oldest = seriesCache.current.keys().next().value;
          if (oldest) seriesCache.current.delete(oldest);
        }
        seriesCache.current.set(cacheKey, result);
        setSeriesResult({ key: seriesKey, series: result, error: "" });
      })
      .catch((nextError: unknown) => {
        if (alive)
          setSeriesResult({
            key: seriesKey,
            series: null,
            error: message(nextError),
          });
      });
    return () => {
      alive = false;
    };
  }, [jobId, isDemo, index, requestKey, selectedPoint, seriesKey]);

  useEffect(() => {
    if (!playing || !index || frameIndex === null || viewLoading || viewError)
      return;
    const timer = window.setTimeout(() => {
      const next = Math.min((frameIndex ?? -1) + (isDemo ? playbackStep : 1), index.frames.length - 1);
      if (next <= frameIndex) {
        setPlaying(false);
        return;
      }
      const time = index.frames[next].time;
      if (time) setAnchor(new Date(time));
      setFrameIndex(next);
    }, playbackDelay);
    return () => window.clearTimeout(timer);
  }, [playing, index, frameIndex, isDemo, playbackDelay, playbackStep, viewLoading, viewError]);

  function chooseJob(id: string) {
    setFrameIndex(id ? null : 0);
    if (!id) setAnchor(new Date(shorelineDemoIndex.frames[0].time ?? 0));
    setPlaying(false);
    setSearchParams(id ? { job: id } : {});
  }

  function togglePlayback() {
    if (!index || frameIndex === null) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (frameIndex >= index.frames.length - 1) chooseFrame(0);
    setPlaying(true);
  }

  function chooseFrame(position: number) {
    if (!index || !index.frames[position]) return;
    setPlaying(false);
    setFrameIndex(position);
    const time = index.frames[position].time;
    if (time) setAnchor(new Date(time));
  }

  const periodFrom =
    index?.mode === "calendar" ? periodStart(anchor, unit).getTime() : 0;
  const periodTo =
    index?.mode === "calendar" ? shiftPeriod(anchor, unit, 1).getTime() : 0;
  const available =
    index?.mode === "calendar"
      ? index.frames.filter(
          (frame) =>
            frame.time &&
            Date.parse(frame.time) >= periodFrom &&
            Date.parse(frame.time) < periodTo
        )
      : (index?.frames ?? []);
  const firstDatedFrame = index?.frames.find((frame) => frame.time);
  const lastDatedFrame = index?.frames.filter((frame) => frame.time).at(-1);
  const previousAvailableFrame =
    index?.mode === "calendar" && available.length === 0
      ? index.frames
          .filter((frame) => frame.time && Date.parse(frame.time) < periodFrom)
          .at(-1)
      : undefined;
  const nextAvailableFrame =
    index?.mode === "calendar" && available.length === 0
      ? index.frames.find(
          (frame) => frame.time && Date.parse(frame.time) >= periodTo
        )
      : undefined;

  function movePeriod(offset: number) {
    if (!index) return;
    const next = shiftPeriod(anchor, unit, offset);
    const from = next.getTime();
    const to = shiftPeriod(next, unit, 1).getTime();
    const inside = index.frames.filter(
      (frame) =>
        frame.time &&
        Date.parse(frame.time) >= from &&
        Date.parse(frame.time) < to
    );
    setAnchor(next);
    setFrameIndex(inside.at(-1)?.index ?? null);
    setPlaying(false);
  }

  function jumpToDate(value: string) {
    if (!index || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    const from = periodStart(date, unit).getTime();
    const to = shiftPeriod(date, unit, 1).getTime();
    const inside = index.frames.filter(
      (frame) =>
        frame.time &&
        Date.parse(frame.time) >= from &&
        Date.parse(frame.time) < to
    );
    setAnchor(date);
    setFrameIndex(inside.at(-1)?.index ?? null);
    setPlaying(false);
  }

  const currentFrame = view?.current;
  const currentCell = currentFrame?.cells.find(
    (cell) => cell.pointIndex === selectedPoint
  );

  return (
    <section className="min-w-0 space-y-6">
      <header>
        <h1 className="text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
          Динамика берега
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Сравнивайте датированные спутниковые контуры и отдельно изучайте
          сохранённые состояния модели CERC. Снимки и расчёты показываются
          раздельно: это разные источники положения берега.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Разделы динамики берега">
          <a href="#observed-shoreline-heading" className="rounded-md border px-3 py-2 text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Спутниковые наблюдения
          </a>
          <a href="#cerc-shoreline-heading" className="rounded-md border px-3 py-2 text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Расчётные сценарии CERC
          </a>
        </nav>
        {isDemo && (
          <p className="mt-2 text-sm text-muted-foreground">
            Ниже в блоке CERC по умолчанию открыт пример участка Сочи за
            18–25 августа 2026, 00:00 UTC. Собственный расчёт для просмотра
            примера не нужен.
          </p>
        )}
      </header>
      <ObservedShorelineSeries />
      <h2 id="cerc-shoreline-heading" className="text-xl font-semibold">Расчётные сценарии CERC</h2>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="shoreline-kind">Сценарий карты</Label>
            <Select
              value={mapKind}
              onValueChange={(value) => setMapKind(value as MapKind | "all")}
            >
              <SelectTrigger id="shoreline-kind" aria-label="Сценарий карты">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mapKinds.map((kind) => (
                  <SelectItem key={kind.value} value={kind.value}>
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shoreline-job">Данные для карты</Label>
            <Select
              value={jobId || "__demo__"}
              onValueChange={(value) => chooseJob(value === "__demo__" ? "" : value)}
            >
              <SelectTrigger id="shoreline-job" aria-label="Данные для карты">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="__demo__">
                  Пример Сочи · 169 кадров · 18–25 августа 2026
                </SelectItem>
                {jobId && !jobs.some((item) => item.id === jobId) && (
                  <SelectItem value={jobId}>Расчёт {jobId.slice(0, 8)}</SelectItem>
                )}
                {jobs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {jobTitle(item.kind)} · создан{" "}
                    {new Date(item.createdAt).toLocaleString("ru-RU")} ·{" "}
                    {item.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span role="status">
            {listLoading
              ? "Ищем сохранённые карты…"
              : `Загружено карт: ${jobs.length} из ${totalCount ?? jobs.length}`}
          </span>
          {nextCursor && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Загружаем…" : "Показать ещё карты"}
            </Button>
          )}
          {!listLoading && !listError && totalCount === 0 && (
            <span>Своих результатов с интерактивной картой пока нет.</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Пример создан Go CLI по сохранённому волновому прогнозу. Собственные
          расчёты CERC с сохранённым индексом карты доступны здесь после
          завершения, включая старые страницы истории.
        </p>
        <p className="text-sm text-muted-foreground">
          Для просмотра других дат запустите расчёт «Эрозия · свои данные» с
          береговым контуром, батиметрией и волновым рядом с временными метками.
          На шкале появятся только даты рассчитанных состояний.{" "}
          <Link to="/lab/calculations" className="text-primary underline">
            Перейти к расчётам
          </Link>
        </p>
        {listError && (
          <p role="alert" className="text-sm text-destructive">
            {listError}{" "}
            <Button variant="link" onClick={reloadList}>
              Повторить
            </Button>
          </p>
        )}
        {loadMoreError && (
          <p role="alert" className="text-sm text-destructive">
            {loadMoreError}{" "}
            <Button variant="link" onClick={() => void loadMore()}>
              Повторить загрузку
            </Button>
          </p>
        )}
      </div>

      {loading ? (
        <p role="status">Загружаем расчёт и индекс карты…</p>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
        >
          {error}{" "}
          <Button
            variant="link"
            onClick={() => setRevision((value) => value + 1)}
          >
            Повторить
          </Button>
        </div>
      ) : !isDemo && job?.status !== "succeeded" ? (
        <p className="rounded-xl border p-5 text-muted-foreground">
          Карта будет доступна после успешного завершения расчёта. Текущий
          статус: {job ? statusLabel(job.status) : "неизвестен"}.
        </p>
      ) : !index ? (
        <div className="rounded-xl border p-5">
          <p>
            Для этого результата интерактивная карта не создана. Ранее
            сохранённые SVG и полный JSON доступны на странице расчёта.
          </p>
          <Link
            to={`/lab/calculations/${jobId}`}
            className="mt-2 inline-block text-primary underline"
          >
            Открыть результат
          </Link>
        </div>
      ) : (
        <>
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-label="Рабочая область реплея">
          <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4" aria-label="Реплей береговой линии">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Реплей береговой линии</h2>
                <p className="text-sm text-muted-foreground">
                  {frameIndex === null ? "В выбранном периоде нет кадра" : frameLabel(index, frameIndex)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={frameIndex === null || frameIndex <= 0}
                  onClick={() => chooseFrame((frameIndex ?? 0) - 1)}
                >
                  Предыдущий кадр
                </Button>
                <Button
                  type="button"
                  disabled={frameIndex === null || frameIndex >= index.frames.length - 1}
                  onClick={() => chooseFrame((frameIndex ?? 0) + 1)}
                >
                  Следующий кадр
                </Button>
                <Button
                  type="button"
                  disabled={
                    frameIndex === null ||
                    window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  }
                  onClick={togglePlayback}
                >
                  {playing ? "Пауза" : "▶ Воспроизвести"}
                </Button>
                <div className="flex items-center gap-2">
                  <Label htmlFor="shoreline-playback-speed">Скорость</Label>
                  <Select
                    value={String(playbackDelay)}
                    onValueChange={(value) => setPlaybackDelay(Number(value))}
                  >
                    <SelectTrigger
                      id="shoreline-playback-speed"
                      aria-label="Скорость"
                      className="min-h-9 w-24"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2800">0,5×</SelectItem>
                      <SelectItem value="1400">1×</SelectItem>
                      <SelectItem value="700">2×</SelectItem>
                      <SelectItem value="350">4×</SelectItem>
                      <SelectItem value="175">8×</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isDemo && <div className="flex items-center gap-2">
                  <Label htmlFor="shoreline-playback-step">Шаг просмотра</Label>
                  <Select value={String(playbackStep)} onValueChange={(value) => setPlaybackStep(Number(value))}>
                    <SelectTrigger id="shoreline-playback-step" aria-label="Шаг просмотра" className="min-h-9 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Каждый час</SelectItem>
                      <SelectItem value="24">Каждые сутки</SelectItem>
                    </SelectContent>
                  </Select>
                </div>}
              </div>
            </div>
            {isDemo && <div className="rounded-lg bg-warning-background p-3 text-sm text-warning">
              Демонстрационный расчёт за 7 суток: это состояния модели по сохранённым волнам, не наблюдения и не годовой прогноз.
              <details className="mt-1"><summary className="cursor-pointer font-medium">Как исследовать более длинный период</summary>
                <p className="mt-2">По умолчанию реплей показывает суточные переходы; все часы доступны на шкале. Для исследования за год нужны датированные наблюдения, архив волн не менее 8766 часов, батиметрия и параметры активного профиля. Сначала калибруйте CERC по наблюдениям, затем запускайте полный волновой ряд с числом шагов 0. Результат требует независимой проверки; приливы и подъём уровня моря CERC автоматически не учитывает. <Link to="/lab" className="underline">Создать расчёт по своим данным</Link>.</p>
              </details>
            </div>}
            {frameIndex === null ? (
              <p role="status" className="text-sm text-muted-foreground">Выберите период с сохранённым состоянием.</p>
            ) : viewError ? (
              <div role="alert" className="rounded-xl border border-destructive p-4 text-destructive">
                {viewError}{" "}
                <Button variant="link" onClick={() => { chunks.current.clear(); setViewRevision((value) => value + 1); }}>
                  Повторить
                </Button>
              </div>
            ) : displayedView ? (
              <div aria-busy={viewLoading} className="relative">
                <ShorelineMap
                  key={requestKey}
                  index={index}
                  initial={displayedView.initial}
                  current={displayedView.current}
                  selectedPoint={selectedPoint}
                  onSelectPoint={setSelectedPoint}
                />
                {viewLoading && <p role="status" className="absolute bottom-3 right-3 z-10 max-w-[18rem] rounded-md border bg-background/95 p-2 text-xs shadow-sm">
                  Загружаем выбранный кадр; пока показан предыдущий контур.
                </p>}
              </div>
            ) : viewLoading ? <p role="status">Загружаем кадры карты…</p> : null}
            {frameIndex !== null && index.frames.length > 1 && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Кадр {frameIndex + 1} из {index.frames.length}</span>
                  <span className="text-muted-foreground">{frameLabel(index, frameIndex)}</span>
                </div>
                <Slider
                  aria-label="Состояние береговой линии"
                  min={0}
                  max={index.frames.length - 1}
                  step={1}
                  value={[frameIndex]}
                  onValueChange={([position]) => chooseFrame(position)}
                />
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Исходная линия</span>
                  <span>Шаг {index.frames.length - 1}</span>
                </div>
              </div>
            )}
            {index.mode === "calendar" && (
              <ShorelineYearNavigator frames={index.frames} selectedPosition={frameIndex}
                onSelectPosition={chooseFrame} label="Охват расчётных состояний по годам" />
            )}
          </section>

          <section className="min-w-0 space-y-5 rounded-xl border bg-card p-4" aria-label="Графики реплея">
            <div>
              <h2 className="text-xl font-semibold">Графики выбранного кадра</h2>
              <p className="text-sm text-muted-foreground">{displayedFrame ? frameLabel(index, displayedFrame.index) : frameIndex === null ? "Выберите кадр на шкале карты" : "Загружаем выбранный кадр"} · узел {selectedPoint + 1}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-muted-foreground">Смещение узла за шаг</dt>
                <dd className="mt-1 font-semibold tabular-nums">{displayedCell ? `${smallDistance.format(displayedCell.shorelineChangeM)} м` : "Нет значения"}</dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-muted-foreground">Высота волны</dt>
                <dd className="mt-1 font-semibold tabular-nums">{displayedMeta?.waveHeightM == null ? "Нет значения" : `${number.format(displayedMeta.waveHeightM)} м`}</dd>
              </div>
            </dl>
            {index.pointSeries ? (
              seriesLoading ? <p role="status">Загружаем временной ряд выбранного узла…</p>
                : seriesError ? <div role="alert" className="rounded-xl border border-destructive p-4 text-destructive">
                  {seriesError} <Button variant="link" onClick={() => setSeriesRevision((value) => value + 1)}>Повторить</Button>
                </div>
                  : series && displayedFrame ? <ShorelinePointTimelineChart index={index} series={series} selectedIndex={displayedFrame.index} /> : null
            ) : <p className="text-sm text-muted-foreground">Для этого результата временной график узла не создан.</p>}
            {displayedFrame && <WaveTimelineChart index={index} selectedIndex={displayedFrame.index} />}
            {displayedFrame && <ShorelineChangeChart frame={displayedFrame} selectedPoint={selectedPoint} />}
          </section>
          </div>

          <section
            className="space-y-3 rounded-xl border bg-card p-4"
            aria-labelledby="shoreline-passport"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="shoreline-passport" className="text-xl font-semibold">
                Паспорт просмотра
              </h2>
              {!isDemo && (
                <Link
                  to={`/lab/calculations/${jobId}`}
                  className="text-sm text-primary underline"
                >
                  Открыть полный расчёт
                </Link>
              )}
            </div>
            <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
              {index.scenarioStatus === "demo"
                ? "Демонстрационный сценарий. Это не прогноз изменения берега."
                : "Расчёт по собственным данным. Пригодность для прогноза не подтверждена автоматически."}
            </p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">
                  Источник волнового ряда
                </dt>
                <dd className="font-medium break-words">
                  {index.waveSource || "Не указан"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Батиметрия</dt>
                <dd className="font-medium">
                  {index.bathymetryStatus || "Статус не указан"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Метод</dt>
                <dd className="font-medium">
                  {isDemo ? "cerc-one-line · baseline-1" : `${job?.methodId ?? "Не указан"} · ${job?.methodRevision ?? "ревизия не указана"}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Система координат</dt>
                <dd className="font-medium">{index.crs}, градусы</dd>
              </div>
            </dl>
            {index.usageLimitations.length > 0 && (
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {index.usageLimitations.map((item, position) => (
                  <li key={position}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="space-y-4 rounded-xl border bg-card p-4"
            aria-label="Шкала состояний"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Шкала состояний</h2>
              <span className="text-sm text-muted-foreground">
                {index.frames.length} кадров
              </span>
            </div>
            {index.mode === "calendar" && firstDatedFrame?.time && lastDatedFrame?.time && (
              <p className="text-sm text-muted-foreground">
                Сохранённый ряд: {utcDateTime.format(new Date(firstDatedFrame.time))} — {utcDateTime.format(new Date(lastDatedFrame.time))} UTC.
              </p>
            )}
            {index.mode === "calendar" ? (
              <>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Масштаб времени"
                >
                  {units.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={unit === option.value ? "default" : "outline"}
                      onClick={() => setUnit(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => movePeriod(-1)}
                    aria-label="Предыдущий период"
                  >
                    ←
                  </Button>
                  <strong className="min-w-40 text-center text-sm">
                    {periodLabel(anchor, unit)} · UTC
                  </strong>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => movePeriod(1)}
                    aria-label="Следующий период"
                  >
                    →
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {available.length} состояний в периоде
                  </span>
                </div>
                <Label htmlFor="shoreline-date">
                  Перейти к дате (UTC)
                </Label>
                <DatePicker
                  id="shoreline-date"
                  label="Перейти к дате (UTC)"
                  value={anchor.toISOString().slice(0, 10)}
                  onChange={jumpToDate}
                />
                {available.length === 0 && (
                  <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
                    <p role="status">
                      В этом периоде нет сохранённого состояния. Можно перейти к
                      ближайшему рассчитанному кадру.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {previousAvailableFrame && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => chooseFrame(previousAvailableFrame.index)}
                        >
                          Раньше: {frameLabel(index, previousAvailableFrame.index)}
                        </Button>
                      )}
                      {nextAvailableFrame && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => chooseFrame(nextAvailableFrame.index)}
                        >
                          Позже: {frameLabel(index, nextAvailableFrame.index)}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                У волнового ряда нет календарных меток. Перемещение доступно
                только по шагам модели.
              </p>
            )}
          </section>

          {view && currentFrame ? (
            <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Значения кадра и узла">
              <h2 className="text-xl font-semibold">Точные значения кадра и узла</h2>
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <caption className="mb-2 text-left font-medium">
                      Значения выбранного состояния и узла
                    </caption>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Состояние
                        </th>
                        <td>{frameLabel(index, currentFrame.index)}</td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Длительность шага
                        </th>
                        <td>
                          {currentDurationHours === null
                            ? "Не указана"
                            : `${number.format(currentDurationHours)} ч`}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Координаты узла
                        </th>
                        <td>
                          {number.format(
                            currentFrame.points[selectedPoint]?.lat ?? 0
                          )}
                          ° с. ш.,{" "}
                          {number.format(
                            currentFrame.points[selectedPoint]?.lon ?? 0
                          )}
                          ° в. д.
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Смещение ячейки за шаг
                        </th>
                        <td>
                          {currentCell
                            ? `${smallDistance.format(currentCell.shorelineChangeM)} м`
                            : "Нет значения для этого узла"}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Высота волны
                        </th>
                        <td>
                          {currentMeta?.waveHeightM === null
                            ? "Нет значения"
                            : `${number.format(currentMeta?.waveHeightM ?? 0)} м`}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Эродированный объём шага
                        </th>
                        <td>
                          {currentMeta?.erodedVolumeM3 === null
                            ? "Нет значения"
                            : `${number.format(currentMeta?.erodedVolumeM3 ?? 0)} м³`}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Отложенный объём шага
                        </th>
                        <td>
                          {currentMeta?.depositedVolumeM3 === null
                            ? "Нет значения"
                            : `${number.format(currentMeta?.depositedVolumeM3 ?? 0)} м³`}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 pr-4 font-normal text-muted-foreground">
                          Невязка баланса шага
                        </th>
                        <td>
                          {currentMeta?.balanceClosureResidualM3 === null
                            ? "Нет значения"
                            : `${number.format(currentMeta?.balanceClosureResidualM3 ?? 0)} м³`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
