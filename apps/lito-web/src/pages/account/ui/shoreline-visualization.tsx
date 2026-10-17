import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type {
  ShorelinePointSeriesDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";

type Frame = ShorelineVisualizationChunkDto["frames"][number];
const distance = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 7,
});
const coordinate = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 6,
});
const mapStyleUrl = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

function changeKind(value: number) {
  if (value < 0) return "landward";
  if (value > 0) return "seaward";
  return "zero";
}

function changeLabel(value: number) {
  if (value < 0) return "смещение к суше";
  if (value > 0) return "смещение к морю";
  return "нулевое смещение";
}

function useChartWidth(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => typeof window === "undefined"
    ? 800 : Math.min(800, Math.max(280, window.innerWidth - 64)));
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
  const { ref: mapRef, width: mapWidth } = useChartWidth(true);
  const compactMap = mapWidth < 600;
  const mapHeight = compactMap ? 1500 : 440;
  const mapPadding = compactMap ? 60 : 48;
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showInitial, setShowInitial] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [basemap, setBasemap] = useState<MapLibreMap | null>(null);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [, setMapRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let instance: MapLibreMap | null = null;
    let pendingFrame = 0;
    let loaded = false;
    let timeout = 0;
    void import("maplibre-gl").then(({ Map, ScaleControl, setWorkerUrl }) => {
      if (!active || !mapContainerRef.current) return;
      setWorkerUrl(mapWorkerUrl);
      const [west, south, east, north] = index.bounds;
      try {
        instance = new Map({
          container: mapContainerRef.current,
          style: mapStyleUrl,
          center: [(west + east) / 2, (south + north) / 2],
          zoom: 10,
          attributionControl: { compact: false },
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setBasemapFailed(true);
        return;
      }
      const currentMap = instance;
      currentMap.addControl(new ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");
      const update = () => {
        if (pendingFrame) return;
        pendingFrame = window.requestAnimationFrame(() => {
          pendingFrame = 0;
          if (active) setMapRevision((value) => value + 1);
        });
      };
      currentMap.on("load", () => {
        if (!active) return;
        loaded = true;
        const lonPad = Math.max((east - west) * 0.25, 0.0002);
        const latPad = Math.max((north - south) * 0.25, 0.0002);
        currentMap.fitBounds(
          [[west - lonPad, south - latPad], [east + lonPad, north + latPad]],
          { padding: 40, maxZoom: 15, duration: 0 },
        );
        setBasemap(currentMap);
      });
      currentMap.on("move", update);
      currentMap.on("resize", update);
      currentMap.on("error", () => {
        if (!loaded && active) setBasemapFailed(true);
      });
      timeout = window.setTimeout(() => {
        if (!loaded && active) setBasemapFailed(true);
      }, 12000);
    }).catch(() => {
      if (active) setBasemapFailed(true);
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(pendingFrame);
      instance?.remove();
    };
  }, [index.bounds]);

  useEffect(() => {
    if (!basemap) return;
    basemap.resize();
  }, [basemap, mapHeight, mapWidth]);
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
        [mapPadding, mapPadding],
        [800 - mapPadding, mapHeight - mapPadding],
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
    return { projection, path };
  }, [index.bounds, mapHeight, mapPadding]);
  const projectCoordinate = (coordinates: [number, number]): [number, number] | null => {
    if (!basemap) return geometry.projection(coordinates);
    const canvas = basemap.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return geometry.projection(coordinates);
    const point = basemap.project(coordinates);
    return [point.x * 800 / width, point.y * mapHeight / height];
  };
  const contourPath = (frame: Frame) => {
    if (!basemap) return geometry.path(lineGeometry(frame)) ?? "";
    const points = frame.points.map((point) => projectCoordinate([point.lon, point.lat]));
    return line<[number, number]>().x((point) => point[0]).y((point) => point[1])(
      points.filter((point): point is [number, number] => point !== null)
    ) ?? "";
  };
  const gridPath = (() => {
    const screenToCoordinate = (x: number, y: number): [number, number] | null => {
      if (basemap) {
        const canvas = basemap.getCanvas();
        if (!canvas.clientWidth || !canvas.clientHeight) return null;
        const point = basemap.unproject([
          x * canvas.clientWidth / 800,
          y * canvas.clientHeight / mapHeight,
        ]);
        return [point.lng, point.lat];
      }
      return geometry.projection.invert?.([
        (x - view.x - 400) / view.scale + 400,
        (y - view.y - mapHeight / 2) / view.scale + mapHeight / 2,
      ]) ?? null;
    };
    const lowerLeft = screenToCoordinate(0, mapHeight);
    const upperRight = screenToCoordinate(800, 0);
    if (!lowerLeft || !upperRight) return "";
    const screenPoint = (coordinates: [number, number]) => {
      const point = projectCoordinate(coordinates);
      if (!point) return null;
      return basemap ? point : [
        (point[0] - 400) * view.scale + 400 + view.x,
        (point[1] - mapHeight / 2) * view.scale + mapHeight / 2 + view.y,
      ];
    };
    const longitudeLines = scaleLinear().domain([lowerLeft[0], upperRight[0]]).ticks(7)
      .map((longitude) => {
        const point = screenPoint([longitude, (lowerLeft[1] + upperRight[1]) / 2]);
        return point ? `M${point[0]},0V${mapHeight}` : "";
      });
    const latitudeLines = scaleLinear().domain([lowerLeft[1], upperRight[1]]).ticks(6)
      .map((latitude) => {
        const point = screenPoint([(lowerLeft[0] + upperRight[0]) / 2, latitude]);
        return point ? `M0,${point[1]}H800` : "";
      });
    return [...longitudeLines, ...latitudeLines].join(" ");
  })();
  const selected = current.points[selectedPoint];
  const initialSelected = initial.points[selectedPoint];
  const screenPoint = selected
    ? projectCoordinate([selected.lon, selected.lat])
    : null;
  const initialScreenPoint = initialSelected
    ? projectCoordinate([initialSelected.lon, initialSelected.lat])
    : null;
  const closeup = basemap ? basemap.getZoom() >= 19 : view.scale >= 1000;
  const focusSelectedPoint = () => {
    if (!initialSelected) return;
    if (basemap) {
      basemap.jumpTo({ center: [initialSelected.lon, initialSelected.lat], zoom: 22 });
      return;
    }
    const point = geometry.projection([initialSelected.lon, initialSelected.lat]);
    if (!point) return;
    const scale = 1000;
    setView({
      scale,
      x: -scale * (point[0] - 400),
      y: -scale * (point[1] - mapHeight / 2),
    });
  };
  const cellsByPoint = new Map(
    current.cells.map((cell) => [cell.pointIndex, cell] as const)
  );
  const selectedCell = cellsByPoint.get(selectedPoint);
  const markerRadius = closeup ? 3 :
    current.points.length > 60
      ? compactMap
        ? 6
        : 3.5
      : compactMap
        ? 13
        : 6;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Положение береговой линии</h2>
        <div className="flex flex-wrap gap-1" aria-label="Управление картой">
          <Button type="button" size="sm" variant="outline"
            disabled={!initialSelected} onClick={focusSelectedPoint}>
            Крупный план узла
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showInitial ? "default" : "outline"}
            aria-pressed={showInitial}
            onClick={() => setShowInitial((value) => !value)}
          >
            Исходный контур
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showGrid ? "default" : "outline"}
            aria-pressed={showGrid}
            onClick={() => setShowGrid((value) => !value)}
          >
            Координатная сетка
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showChanges ? "default" : "outline"}
            aria-pressed={showChanges}
            onClick={() => setShowChanges((value) => !value)}
          >
            Смещения по узлам
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Увеличить карту"
            onClick={() => basemap
              ? basemap.zoomIn()
              : setView((v) => ({ ...v, scale: Math.min(v.scale * 1.4, 2000) }))}
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Уменьшить карту"
            onClick={() => basemap
              ? basemap.zoomOut()
              : setView((v) => ({ ...v, scale: Math.max(v.scale / 1.4, 1) }))}
          >
            −
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (basemap) {
                const [west, south, east, north] = index.bounds;
                const lonPad = Math.max((east - west) * 0.25, 0.0002);
                const latPad = Math.max((north - south) * 0.25, 0.0002);
                basemap.fitBounds(
                  [[west - lonPad, south - latPad], [east + lonPad, north + latPad]],
                  { padding: 40, maxZoom: 15, duration: 0 },
                );
              } else setView({ x: 0, y: 0, scale: 1 });
            }}
          >
            Весь участок
          </Button>
        </div>
      </div>
      <div ref={mapRef} className="relative overflow-hidden rounded-xl border bg-muted/40">
        <div className="absolute inset-0">
          <div ref={mapContainerRef} className="h-full w-full" role="group" aria-label="Географическая подложка участка берега" />
        </div>
        <svg
          viewBox={`0 0 800 ${mapHeight}`}
          role="img"
          aria-label={`Карта: исходная линия и положение после шага ${current.index}. Выбран узел ${selectedPoint + 1}. Геометрия показана без смещения координат.`}
          className={`relative block w-full touch-none ${basemap ? "pointer-events-none" : ""}`}
          style={{ aspectRatio: `800 / ${mapHeight}` }}
          onPointerDown={(event) => {
            if (basemap) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (basemap || !drag) return;
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
          <rect width="800" height={mapHeight} fill={basemap ? "transparent" : "var(--card)"} />
          {showGrid && (
            <path data-map-grid="local" d={gridPath} fill="none"
              stroke={basemap ? "#315362" : "var(--border)"}
              strokeOpacity={basemap ? 0.5 : 1} strokeWidth="1" />
          )}
          <g
            transform={basemap ? undefined : `translate(${view.x} ${view.y}) translate(400 ${mapHeight / 2}) scale(${view.scale}) translate(-400 ${-mapHeight / 2})`}
          >
            {showInitial && (
              <path
                d={contourPath(initial)}
                fill="none"
                stroke="var(--chart-2)"
                strokeWidth={closeup ? 2 : 3}
                strokeDasharray="8 5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              data-actual-contour="true"
              d={contourPath(current)}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth={closeup ? 2 : 4}
              vectorEffect="non-scaling-stroke"
            />
            {current.points.length <= 500 &&
              current.points.map((point, pointIndex) => {
                const projected = projectCoordinate([point.lon, point.lat]);
                if (!projected) return null;
                const cell = cellsByPoint.get(pointIndex);
                const kind = cell
                  ? changeKind(cell.shorelineChangeM)
                  : "missing";
                const cellDescription = cell
                  ? `${changeLabel(cell.shorelineChangeM)}, ${distance.format(cell.shorelineChangeM)} м/шаг`
                  : "нет значения смещения";
                return (
                  <g
                    key={pointIndex}
                    data-change-kind={
                      showChanges && kind !== "missing" ? kind : undefined
                    }
                    onClick={() => onSelectPoint(pointIndex)}
                    className="cursor-pointer pointer-events-auto"
                  >
                    <title>{`Узел ${pointIndex + 1}: ${cellDescription}`}</title>
                    {showChanges && cell && (
                      kind === "landward" ? (
                        <rect
                          x={projected[0] - markerRadius}
                          y={projected[1] - markerRadius}
                          width={markerRadius * 2}
                          height={markerRadius * 2}
                          fill="var(--chart-4)"
                          stroke="var(--card)"
                          strokeWidth="1.5"
                        />
                      ) : (
                        <circle
                          cx={projected[0]}
                          cy={projected[1]}
                          r={markerRadius}
                          fill={
                            kind === "seaward"
                              ? "var(--chart-2)"
                              : "var(--muted-foreground)"
                          }
                          stroke="var(--card)"
                          strokeWidth="1.5"
                        />
                      )
                    )}
                    <circle
                      cx={projected[0]}
                      cy={projected[1]}
                      r={compactMap ? 22 : 12}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            {showInitial && current.index !== initial.index && initialScreenPoint && screenPoint && (
              <g data-selected-displacement="actual">
                <line
                  x1={initialScreenPoint[0]}
                  y1={initialScreenPoint[1]}
                  x2={screenPoint[0]}
                  y2={screenPoint[1]}
                  stroke="var(--chart-3)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={initialScreenPoint[0]}
                  cy={initialScreenPoint[1]}
                  r={closeup ? 4 : compactMap ? 10 : 5}
                  fill="var(--card)"
                  stroke="var(--chart-2)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
            {screenPoint && (
              <circle
                cx={screenPoint[0]}
                cy={screenPoint[1]}
                r={closeup ? 5 : compactMap ? 16 : 7}
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
          <text x="20" y={mapHeight - 15} fill="var(--muted-foreground)" fontSize="12">
            EPSG:4326 · координаты в градусах
          </text>
        </svg>
      </div>
      {basemapFailed && !basemap && <p role="status" className="text-xs text-muted-foreground">
        Географическая подложка недоступна. Контуры и полная координатная сетка остаются на карте.
      </p>}
      {basemap && <p className="text-xs text-muted-foreground">
        Современная карта местности различает сушу и воду; она не показывает состояние на дату расчёта.
        {!import.meta.env.VITE_MAP_STYLE_URL && " Голубая область — Чёрное море, светлая область — суша."}
        {" "}{import.meta.env.VITE_MAP_STYLE_URL ? "Источники подложки указаны на карте." : <>
          Фон: <a href="https://openfreemap.org/" target="_blank" rel="noreferrer" className="underline">OpenFreeMap</a>,
          {" "}<a href="https://openmaptiles.org/" target="_blank" rel="noreferrer" className="underline">OpenMapTiles</a>,
          {" "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap</a>.
        </>}
      </p>}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {showInitial && <span className="inline-flex items-center gap-2">
          <span className="w-7 border-t-[3px] border-dashed border-chart-2" />
          Исходная линия
        </span>}
        <span className="inline-flex items-center gap-2">
          <span className="w-7 border-t-[3px] border-chart-1" />
          Точное положение после шага
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-full bg-chart-3" />
          Выбранный узел
        </span>
        {showChanges && current.cells.length > 0 && (
          <>
            <span className="inline-flex items-center gap-2">
              <span className="size-3 bg-chart-4" />
              К суше (отрицательное смещение)
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-3 rounded-full bg-chart-2" />
              К морю (положительное смещение)
            </span>
          </>
        )}
      </div>
      <p className="text-sm font-medium">
        Узел {selectedPoint + 1}: {selectedCell
          ? `${changeLabel(selectedCell.shorelineChangeM)}, ${distance.format(selectedCell.shorelineChangeM)} м/шаг`
          : "для этого состояния смещение не рассчитано"}
      </p>
      {selected && (
        <p className="text-xs text-muted-foreground">
          Координаты узла: {coordinate.format(selected.lat)}° с. ш., {coordinate.format(selected.lon)}° в. д.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Контуры и узлы показаны в рассчитанных координатах. На обзоре участка малое смещение может быть меньше толщины линии.
        {closeup ? " Крупный план сохраняет положение камеры при смене кадра; масштаб увеличен, координаты не сдвинуты." : " Выберите узел и откройте его крупный план, чтобы увидеть смещение в масштабе карты."}
        {" "}Точное значение дано в метрах за шаг.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="shoreline-point">
          Узел береговой линии
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedPoint <= 0}
          onClick={() => onSelectPoint(selectedPoint - 1)}
          aria-label="Предыдущий узел"
        >
          ←
        </Button>
        <Input
          id="shoreline-point"
          type="number"
          min="1"
          max={index.pointCount}
          value={selectedPoint + 1}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= 1 && value <= index.pointCount)
              onSelectPoint(value - 1);
          }}
          className="h-9 min-h-9 w-20"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedPoint >= index.pointCount - 1}
          onClick={() => onSelectPoint(selectedPoint + 1)}
          aria-label="Следующий узел"
        >
          →
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Метки показывают знак рассчитанного Go смещения за выбранный шаг; их
        цвет и размер не показывают величину смещения. Это направление модели,
        без проверки порога чувствительности и без вывода о наблюдаемом размыве.
        Перетаскивайте карту для перемещения. Масштаб меняется кнопками;
        координаты и значения от него не меняются.
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
