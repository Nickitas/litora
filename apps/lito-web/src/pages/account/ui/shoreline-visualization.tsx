import { useEffect, useMemo, useRef, useState } from "react";
import { geoGraticule, geoMercator, geoPath } from "d3-geo";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import type {
  ShorelinePointSeriesDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";

type Frame = ShorelineVisualizationChunkDto["frames"][number];

function useChartWidth(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.max(280, Math.round(entry.contentRect.width));
      setWidth((current) => (current === next ? current : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);
  return { ref, width };
}

function lineGeometry(frame: Frame) {
  return {
    type: "LineString" as const,
    coordinates: frame.points.map(
      (point) => [point.lon, point.lat] as [number, number]
    ),
  };
}

export function ShorelineMap({
  index,
  initial,
  current,
  selectedPoint,
  onSelectPoint,
}: {
  index: ShorelineVisualizationIndexDto;
  initial: Frame;
  current: Frame;
  selectedPoint: number;
  onSelectPoint: (point: number) => void;
}) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const geometry = useMemo(() => {
    const [west, south, east, north] = index.bounds;
    const longitudePadding = Math.max((east - west) * 0.08, 0.0001);
    const latitudePadding = Math.max((north - south) * 0.08, 0.0001);
    const padded: [number, number, number, number] = [
      west - longitudePadding,
      south - latitudePadding,
      east + longitudePadding,
      north + latitudePadding,
    ];
    const projection = geoMercator().fitExtent(
      [
        [35, 35],
        [765, 405],
      ],
      {
        type: "MultiPoint",
        coordinates: [
          [padded[0], padded[1]],
          [padded[2], padded[3]],
        ],
      }
    );
    const path = geoPath(projection);
    const graticule = geoGraticule().extent([
      [padded[0], padded[1]],
      [padded[2], padded[3]],
    ])();
    return { projection, path, graticule };
  }, [index.bounds]);
  const selected = current.points[selectedPoint];
  const screenPoint = selected
    ? geometry.projection([selected.lon, selected.lat])
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Положение береговой линии</h2>
        <div className="flex gap-1" aria-label="Масштаб карты">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Увеличить карту"
            onClick={() =>
              setView((v) => ({ ...v, scale: Math.min(v.scale * 1.4, 8) }))
            }
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Уменьшить карту"
            onClick={() =>
              setView((v) => ({ ...v, scale: Math.max(v.scale / 1.4, 1) }))
            }
          >
            −
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setView({ x: 0, y: 0, scale: 1 })}
          >
            Сбросить
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-muted/40">
        <svg
          viewBox="0 0 800 440"
          role="img"
          aria-label={`Карта: исходная линия и положение после шага ${current.index}. Выбран узел ${selectedPoint + 1}.`}
          className="block aspect-[800/440] w-full touch-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = 800 / rect.width;
            setView((v) => ({
              ...v,
              x: v.x + (event.clientX - drag.x) * ratio,
              y: v.y + (event.clientY - drag.y) * ratio,
            }));
            setDrag({ x: event.clientX, y: event.clientY });
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <rect width="800" height="440" fill="var(--card)" />
          <g
            transform={`translate(${view.x} ${view.y}) translate(400 220) scale(${view.scale}) translate(-400 -220)`}
          >
            <path
              d={geometry.path(geometry.graticule) ?? ""}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
            />
            <path
              d={geometry.path(lineGeometry(initial)) ?? ""}
              fill="none"
              stroke="var(--chart-2)"
              strokeWidth="3"
              strokeDasharray="8 5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={geometry.path(lineGeometry(current)) ?? ""}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="4"
              vectorEffect="non-scaling-stroke"
            />
            {current.points.length <= 500 &&
              current.points.map((point, pointIndex) => {
                const projected = geometry.projection([point.lon, point.lat]);
                if (!projected) return null;
                return (
                  <circle
                    key={pointIndex}
                    cx={projected[0]}
                    cy={projected[1]}
                    r={pointIndex === selectedPoint ? 5 : 4}
                    fill={
                      pointIndex === selectedPoint
                        ? "var(--chart-3)"
                        : "transparent"
                    }
                    stroke={
                      pointIndex === selectedPoint
                        ? "var(--card)"
                        : "transparent"
                    }
                    onClick={() => onSelectPoint(pointIndex)}
                    className="cursor-pointer"
                  />
                );
              })}
            {screenPoint && (
              <circle
                cx={screenPoint[0]}
                cy={screenPoint[1]}
                r="7"
                fill="none"
                stroke="var(--chart-3)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
          <text x="20" y="25" fill="var(--muted-foreground)" fontSize="14">
            Север ↑
          </text>
          <text x="20" y="425" fill="var(--muted-foreground)" fontSize="12">
            EPSG:4326 · координаты в градусах
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="w-7 border-t-[3px] border-dashed border-chart-2" />
          Исходная линия
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-7 border-t-[3px] border-chart-1" />
          Выбранное состояние
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-full bg-chart-3" />
          Выбранный узел
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Перетаскивайте карту для перемещения. Масштаб меняется кнопками;
        координаты и научные значения от масштаба не меняются.
      </p>
    </div>
  );
}

export function WaveTimelineChart({
  index,
  selectedIndex,
}: {
  index: ShorelineVisualizationIndexDto;
  selectedIndex: number;
}) {
  const values = index.frames.filter((frame) => frame.waveHeightM !== null);
  if (values.length === 0) return null;
  const xValue = (frame: (typeof values)[number]) =>
    index.mode === "calendar" && frame.time
      ? Date.parse(frame.time)
      : frame.index;
  const first = xValue(values[0]);
  const last = xValue(values[values.length - 1]);
  const x =
    index.mode === "calendar"
      ? scaleUtc(
          [new Date(first), new Date(last === first ? last + 1 : last)],
          [50, 750]
        )
      : scaleLinear([first, last === first ? last + 1 : last], [50, 750]);
  const maxHeight = Math.max(
    ...values.map((frame) => frame.waveHeightM ?? 0),
    1
  );
  const y = scaleLinear([0, maxHeight], [165, 25]);
  const every = Math.max(1, Math.ceil(values.length / 240));
  return (
    <section className="space-y-2" aria-labelledby="wave-chart-title">
      <h2 id="wave-chart-title" className="text-lg font-semibold">
        Высота волны по состояниям
      </h2>
      <svg
        viewBox="0 0 800 200"
        role="img"
        aria-label="Точечный график высоты волны в метрах; пропуски времени не соединены линией"
        className="w-full rounded-lg border bg-card"
      >
        <path d="M50 25V165H750" fill="none" stroke="var(--muted-foreground)" />
        <text x="5" y="30" fill="var(--muted-foreground)" fontSize="13">
          м
        </text>
        <text x="48" y="190" fill="var(--muted-foreground)" fontSize="13">
          {index.mode === "calendar" ? "Начало периода" : "Шаг 1"}
        </text>
        <text x="670" y="190" fill="var(--muted-foreground)" fontSize="13">
          {index.mode === "calendar" ? "Конец периода" : `Шаг ${last}`}
        </text>
        {values
          .filter(
            (_, position) =>
              position % every === 0 ||
              position === values.length - 1 ||
              values[position].index === selectedIndex
          )
          .map((frame) => (
            <circle
              key={frame.index}
              cx={x(
                index.mode === "calendar"
                  ? new Date(xValue(frame))
                  : xValue(frame)
              )}
              cy={y(frame.waveHeightM ?? 0)}
              r={frame.index === selectedIndex ? 5 : 2.5}
              fill={
                frame.index === selectedIndex
                  ? "var(--chart-3)"
                  : "var(--chart-1)"
              }
            >
              <title>{`Шаг ${frame.index}: ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(frame.waveHeightM ?? 0)} м${frame.time ? ` · ${frame.time}` : ""}`}</title>
            </circle>
          ))}
      </svg>
      <p className="text-sm text-muted-foreground">
        Точки — значения волновых условий для рассчитанных шагов модели;
        промежуточные состояния берега не рассчитаны.
      </p>
    </section>
  );
}

export function ShorelinePointTimelineChart({
  index,
  series,
  selectedIndex,
}: {
  index: ShorelineVisualizationIndexDto;
  series: ShorelinePointSeriesDto;
  selectedIndex: number;
}) {
  const values = series.shorelineChangeM;
  const hasValues = values.some((value) => value !== null);
  const { ref, width } = useChartWidth(hasValues);
  if (!hasValues)
    return (
      <p className="text-sm text-muted-foreground">
        У узла {series.pointIndex + 1} нет рассчитанного смещения за шаги
        модели.
      </p>
    );
  const maximum = values.reduce<number>(
    (largest, value) => Math.max(largest, Math.abs(value ?? 0)),
    0.000001
  );
  const y = scaleLinear([-maximum, maximum], [165, 25]);
  const firstTime =
    index.mode === "calendar" ? Date.parse(index.frames[0].time ?? "") : 0;
  const lastTime =
    index.mode === "calendar" ? Date.parse(index.frames.at(-1)?.time ?? "") : 1;
  const xCalendar = scaleUtc(
    [
      new Date(firstTime),
      new Date(lastTime === firstTime ? lastTime + 1 : lastTime),
    ],
    [35, width - 15]
  );
  const xSteps = scaleLinear(
    [0, Math.max(values.length - 1, 1)],
    [35, width - 15]
  );
  const x = (position: number) =>
    index.mode === "calendar"
      ? xCalendar(new Date(index.frames[position].time ?? ""))
      : xSteps(position);
  const dots = values
    .map((value, position) =>
      value === null
        ? ""
        : `M${x(position).toFixed(2)},${y(value).toFixed(2)}h0.01`
    )
    .join("");
  const selectedValue = values[selectedIndex];
  const selectedX = x(selectedIndex);
  const formatter = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 7,
  });
  return (
    <section className="space-y-2" aria-labelledby="point-timeline-title">
      <h2 id="point-timeline-title" className="text-lg font-semibold">
        Смещение узла {series.pointIndex + 1} во времени
      </h2>
      <div ref={ref}>
        <svg
          viewBox={`0 0 ${width} 200`}
          role="img"
          aria-label={`Точечный график смещения узла ${series.pointIndex + 1} за шаг модели в метрах. Выбран шаг ${selectedIndex}.`}
          className="h-[200px] w-full rounded-lg border bg-card"
        >
          <path
            d={`M35 25V165H${width - 15}`}
            fill="none"
            stroke="var(--muted-foreground)"
          />
          <path
            d={`M35 ${y(0)}H${width - 15}`}
            fill="none"
            stroke="var(--border)"
            strokeDasharray="4 4"
          />
          <path
            d={dots}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {selectedValue !== null && selectedValue !== undefined && (
            <circle
              cx={selectedX}
              cy={y(selectedValue)}
              r="6"
              fill="var(--chart-3)"
            >
              <title>{`Шаг ${selectedIndex}: ${formatter.format(selectedValue)} м`}</title>
            </circle>
          )}
          <text x="5" y="30" fill="var(--muted-foreground)" fontSize="13">
            м
          </text>
          <text x="35" y="190" fill="var(--muted-foreground)" fontSize="13">
            {index.mode === "calendar" ? "Начало" : "Шаг 1"}
          </text>
          <text
            x={width - 65}
            y="190"
            fill="var(--muted-foreground)"
            fontSize="13"
          >
            {index.mode === "calendar" ? "Конец" : `Шаг ${values.length - 1}`}
          </text>
        </svg>
      </div>
      <p className="text-sm text-muted-foreground">
        Каждая точка — смещение за отдельный шаг модели. Пропуски значений не
        интерполируются; точное значение выбранного шага приведено в таблице.
      </p>
    </section>
  );
}

export function ShorelineChangeChart({
  frame,
  selectedPoint,
}: {
  frame: Frame;
  selectedPoint: number;
}) {
  if (frame.cells.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Исходное состояние: смещение по ячейкам ещё не рассчитано.
      </p>
    );
  const values = frame.cells;
  const extent = Math.max(
    ...values.map((cell) => Math.abs(cell.shorelineChangeM)),
    0.000001
  );
  const x = scaleLinear([0, Math.max(values.length - 1, 1)], [50, 750]);
  const y = scaleLinear([-extent, extent], [165, 25]);
  const path = line<(typeof values)[number]>()
    .x((_, i) => x(i))
    .y((cell) => y(cell.shorelineChangeM))(values);
  const selected = values.find((cell) => cell.pointIndex === selectedPoint);
  return (
    <section className="space-y-2" aria-labelledby="shoreline-chart-title">
      <h2 id="shoreline-chart-title" className="text-lg font-semibold">
        Смещение по ячейкам на выбранном шаге
      </h2>
      <svg
        viewBox="0 0 800 200"
        role="img"
        aria-label="Профиль рассчитанного смещения береговой линии по индексам ячеек, в метрах"
        className="w-full rounded-lg border bg-card"
      >
        <path d="M50 25V165H750" fill="none" stroke="var(--muted-foreground)" />
        <path
          d={`M50 ${y(0)}H750`}
          fill="none"
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <path
          d={path ?? ""}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
        />
        {selected && (
          <circle
            cx={x(values.indexOf(selected))}
            cy={y(selected.shorelineChangeM)}
            r="5"
            fill="var(--chart-3)"
          />
        )}
        <text x="5" y="30" fill="var(--muted-foreground)" fontSize="13">
          м
        </text>
        <text x="50" y="190" fill="var(--muted-foreground)" fontSize="13">
          Начало участка
        </text>
        <text x="655" y="190" fill="var(--muted-foreground)" fontSize="13">
          Конец участка
        </text>
      </svg>
      <p className="text-sm text-muted-foreground">
        Положительное и отрицательное смещение показаны относительно нулевой
        линии. Значение выбранной ячейки приведено в таблице ниже.
      </p>
    </section>
  );
}
