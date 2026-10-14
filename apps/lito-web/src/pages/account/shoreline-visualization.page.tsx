import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  CalculationJobDto,
  ShorelinePointSeriesDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";
import {
  shorelineDemoChunk,
  shorelineDemoIndex,
  shorelineDemoSeries,
} from "@litora/generated-data";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
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

const supportedKinds = new Set([
  "erosion",
  "erosion_file",
  "all_demo",
  "all_file",
]);
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
  return `${frame.index === 0 ? "Исходная линия" : `Шаг ${frame.index}`} · ${new Intl.DateTimeFormat(
    "ru-RU",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }
  ).format(new Date(frame.time))} UTC`;
}

export function ShorelineVisualizationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get("job") ?? "";
  const isDemo = !jobId;
  const [jobs, setJobs] = useState<CalculationJobDto[]>([]);
  const [listError, setListError] = useState("");
  const [listRevision, setListRevision] = useState(0);
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
    void api
      .calculations()
      .then((result) => {
        if (alive) {
          setJobs(result.filter((item) => supportedKinds.has(item.kind)));
          setListError("");
        }
      })
      .catch((nextError: unknown) => {
        if (alive) setListError(message(nextError));
      });
    return () => {
      alive = false;
    };
  }, [listRevision]);

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
        ? shorelineDemoChunk
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
        if (alive)
          setViewResult({
            key: viewKey,
            view: null,
            error: message(nextError),
          });
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
      ? Promise.resolve(shorelineDemoSeries[selectedPoint])
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
    if (!playing || !index) return;
    const timer = window.setTimeout(() => {
      const next = (frameIndex ?? -1) + 1;
      if (next >= index.frames.length) {
        setPlaying(false);
        return;
      }
      const time = index.frames[next].time;
      if (time) setAnchor(new Date(time));
      setFrameIndex(next);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [playing, index, frameIndex]);

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
          Исследуйте сохранённые состояния модели CERC на карте и графиках. Это
          расчёт по волновому ряду, а не наблюдение берега в реальном времени.
        </p>
        {isDemo && (
          <p className="mt-2 text-sm text-muted-foreground">
            Сейчас открыт пример участка Сочи: 18 августа 2026, 00:00–03:00 UTC.
            Собственный расчёт для просмотра не нужен.
          </p>
        )}
      </header>
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <label htmlFor="shoreline-job" className="block text-sm font-medium">
          Данные для карты
        </label>
        <select
          id="shoreline-job"
          value={jobId}
          onChange={(event) => chooseJob(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="">Пример Сочи · 4 кадра · 18 августа 2026</option>
          {jobId && !jobs.some((item) => item.id === jobId) && (
            <option value={jobId}>Расчёт {jobId.slice(0, 8)}</option>
          )}
          {jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {jobTitle(item.kind)} ·{" "}
              {new Date(item.createdAt).toLocaleString("ru-RU")} ·{" "}
              {statusLabel(item.status)}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Пример создан Go CLI по сохранённому волновому прогнозу. Собственные
          расчёты CERC доступны здесь после завершения; более ранний можно
          открыть из его страницы результата.
        </p>
        <p className="text-sm text-muted-foreground">
          Для просмотра других дат запустите расчёт «Эрозия · свои данные» с
          береговым контуром, батиметрией и волновым рядом с временными метками.
          На шкале появятся только даты рассчитанных состояний.{" "}
          <Link to="/account/calculations" className="text-primary underline">
            Перейти к расчётам
          </Link>
        </p>
        {listError && (
          <p role="alert" className="text-sm text-destructive">
            {listError}{" "}
            <Button
              variant="link"
              onClick={() => setListRevision((value) => value + 1)}
            >
              Повторить
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
            to={`/account/calculations/${jobId}`}
            className="mt-2 inline-block text-primary underline"
          >
            Открыть результат
          </Link>
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="Реплей береговой линии">
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
              </div>
            </div>
            {isDemo && (
              <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
                Короткий демонстрационный расчёт за 3 часа. Смещение мало для масштаба карты;
                точные значения доступны на графике и в таблице. Это не годовой прогноз.
              </p>
            )}
            {frameIndex === null ? (
              <p role="status" className="text-sm text-muted-foreground">Выберите период с сохранённым состоянием.</p>
            ) : viewLoading ? (
              <p role="status">Загружаем кадры карты…</p>
            ) : viewError ? (
              <div role="alert" className="rounded-xl border border-destructive p-4 text-destructive">
                {viewError}{" "}
                <Button variant="link" onClick={() => { chunks.current.clear(); setViewRevision((value) => value + 1); }}>
                  Повторить
                </Button>
              </div>
            ) : view ? (
              <ShorelineMap
                index={index}
                initial={view.initial}
                current={view.current}
                selectedPoint={selectedPoint}
                onSelectPoint={setSelectedPoint}
              />
            ) : null}
          </section>

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
                  to={`/account/calculations/${jobId}`}
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
                <label
                  htmlFor="shoreline-date"
                  className="block text-sm font-medium"
                >
                  Перейти к дате (UTC)
                </label>
                <input
                  id="shoreline-date"
                  type="date"
                  value={anchor.toISOString().slice(0, 10)}
                  onChange={(event) => jumpToDate(event.target.value)}
                  className="min-h-11 rounded-lg border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
                {available.length === 0 && (
                  <p role="status" className="rounded-lg bg-muted p-3 text-sm">
                    В этом периоде нет сохранённого состояния. Ближайшие:{" "}
                    {index.frames
                      .filter(
                        (frame) =>
                          frame.time && Date.parse(frame.time) < periodFrom
                      )
                      .at(-1)?.time ?? "нет"}{" "}
                    /{" "}
                    {index.frames.find(
                      (frame) =>
                        frame.time && Date.parse(frame.time) >= periodTo
                    )?.time ?? "нет"}
                    . Выберите соседний период.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                У волнового ряда нет календарных меток. Перемещение доступно
                только по шагам модели.
              </p>
            )}
            {available.length > 0 && (
              <div className="space-y-2">
                <label
                  htmlFor="shoreline-frame"
                  className="text-sm font-medium"
                >
                  {frameIndex === null
                    ? "Выберите состояние"
                    : frameLabel(index, frameIndex)}
                </label>
                <input
                  id="shoreline-frame"
                  type="range"
                  min="0"
                  max={Math.max(available.length - 1, 0)}
                  value={Math.max(
                    0,
                    available.findIndex((frame) => frame.index === frameIndex)
                  )}
                  onChange={(event) =>
                    chooseFrame(available[Number(event.target.value)].index)
                  }
                  className="w-full accent-primary"
                />
              </div>
            )}
          </section>

          {currentMeta && (
            <WaveTimelineChart
              index={index}
              selectedIndex={currentMeta.index}
            />
          )}
          {view && currentFrame ? (
            <div className="space-y-6 rounded-xl border bg-card p-4">
              {index.pointSeries ? (
                seriesLoading ? (
                  <p role="status">Загружаем временной ряд выбранного узла…</p>
                ) : seriesError ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-destructive p-4 text-destructive"
                  >
                    {seriesError}{" "}
                    <Button
                      variant="link"
                      onClick={() => setSeriesRevision((value) => value + 1)}
                    >
                      Повторить
                    </Button>
                  </div>
                ) : series ? (
                  <ShorelinePointTimelineChart
                    index={index}
                    series={series}
                    selectedIndex={currentFrame.index}
                  />
                ) : null
              ) : (
                <p className="text-sm text-muted-foreground">
                  Для этого результата временной график узла не создан.
                </p>
              )}
              <ShorelineChangeChart
                frame={currentFrame}
                selectedPoint={selectedPoint}
              />
              <div className="space-y-3">
                <label
                  htmlFor="shoreline-point"
                  className="block text-sm font-medium"
                >
                  Узел береговой линии
                </label>
                <input
                  id="shoreline-point"
                  type="number"
                  min="1"
                  max={index.pointCount}
                  value={selectedPoint + 1}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (
                      Number.isInteger(value) &&
                      value >= 1 &&
                      value <= index.pointCount
                    )
                      setSelectedPoint(value - 1);
                  }}
                  className="h-11 w-28 rounded-lg border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
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
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
