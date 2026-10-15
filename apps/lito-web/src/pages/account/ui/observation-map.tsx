import { useEffect, useMemo, useRef, useState } from "react";
import { geoGraticule, geoMercator, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { line as d3Line } from "d3-shape";
import { Map as MapLibreMap, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { ObservedShorelineSeriesDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";

const customMapStyleUrl = import.meta.env.VITE_MAP_STYLE_URL;
const mapStyleUrl = customMapStyleUrl || "https://tiles.openfreemap.org/styles/liberty";
setWorkerUrl(mapWorkerUrl);

function projectedPath(map: MapLibreMap, coordinates: [number, number][]) {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return "";
  const points: [number, number][] = coordinates.map(([longitude, latitude]) => {
    const point = map.project([longitude, latitude]);
    return [point.x * 800 / width, point.y * 490 / height];
  });
  return d3Line<[number, number]>()(points) ?? "";
}

export default function ObservationMap({ series, position }: { series: ObservedShorelineSeriesDto; position: number }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const positionRef = useRef(position);
  const [basemapReady, setBasemapReady] = useState(false);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [mapPaths, setMapPaths] = useState({ baseline: "", current: "" });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [showBaseline, setShowBaseline] = useState(true);
  const [compareBlink, setCompareBlink] = useState(false);
  const [blinkCurrent, setBlinkCurrent] = useState(true);
  const fallbackPaths = useMemo(() => {
    const [west, south, east, north] = series.bounds;
    const padLon = Math.max((east - west) * 0.08, 0.0001);
    const padLat = Math.max((north - south) * 0.08, 0.0001);
    const projection = geoMercator().fitExtent([[36, 36], [764, 454]], {
      type: "MultiPoint",
      coordinates: [[west - padLon, south - padLat], [east + padLon, north + padLat]],
    });
    const path = geoPath(projection);
    const longitudeTicks = scaleLinear().domain([west - padLon, east + padLon]).ticks(5);
    const latitudeTicks = scaleLinear().domain([south - padLat, north + padLat]).ticks(5);
    const grid = geoGraticule().extent([
      [west - padLon, south - padLat], [east + padLon, north + padLat],
    ]).step([
      longitudeTicks[1] - longitudeTicks[0] || padLon,
      latitudeTicks[1] - latitudeTicks[0] || padLat,
    ])();
    const shape = (coordinates: [number, number][]) => path({ type: "LineString", coordinates }) ?? "";
    return {
      grid: path(grid) ?? "",
      baseline: shape(series.frames[0].coordinates),
      current: shape(series.frames[position].coordinates),
    };
  }, [series, position]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!mapContainer.current) {
      const timer = window.setTimeout(() => setBasemapFailed(true), 0);
      return () => window.clearTimeout(timer);
    }
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: mapContainer.current,
        style: mapStyleUrl,
        center: [(series.bounds[0] + series.bounds[2]) / 2, (series.bounds[1] + series.bounds[3]) / 2],
        zoom: 10,
        attributionControl: { compact: false },
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      const timer = window.setTimeout(() => setBasemapFailed(true), 0);
      return () => window.clearTimeout(timer);
    }
    map.current = instance;
    instance.addControl(new ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");
    let active = true;
    let loaded = false;
    let pendingFrame = 0;
    const fit = () => {
      const [west, south, east, north] = series.bounds;
      const lonPadding = Math.max((east - west) * 0.08, 0.0001);
      const latPadding = Math.max((north - south) * 0.08, 0.0001);
      instance.fitBounds(
        [[west - lonPadding, south - latPadding], [east + lonPadding, north + latPadding]],
        { padding: 40, maxZoom: 16, duration: 0 },
      );
    };
    const project = () => {
      if (!active || !loaded) return;
      setMapPaths({
        baseline: projectedPath(instance, series.frames[0].coordinates),
        current: projectedPath(instance, series.frames[positionRef.current].coordinates),
      });
    };
    const scheduleProject = () => {
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        project();
      });
    };
    const onLoad = () => {
      loaded = true;
      fit();
      project();
      setBasemapReady(true);
    };
    const onError = () => {
      if (!loaded && active) setBasemapFailed(true);
    };
    const timeout = window.setTimeout(() => {
      if (!loaded && active) setBasemapFailed(true);
    }, 12000);
    instance.on("load", onLoad);
    instance.on("move", scheduleProject);
    instance.on("resize", scheduleProject);
    instance.on("error", onError);
    return () => {
      active = false;
      window.cancelAnimationFrame(pendingFrame);
      window.clearTimeout(timeout);
      instance.remove();
      if (map.current === instance) map.current = null;
    };
  }, [series]);

  useEffect(() => {
    if (!basemapReady || !map.current) return;
    const instance = map.current;
    setMapPaths({
      baseline: projectedPath(instance, series.frames[0].coordinates),
      current: projectedPath(instance, series.frames[position].coordinates),
    });
  }, [basemapReady, position, series]);

  useEffect(() => {
    if (!compareBlink) return;
    const timer = window.setInterval(() => setBlinkCurrent((value) => !value), 700);
    return () => window.clearInterval(timer);
  }, [compareBlink]);

  function reset() {
    if (basemapReady && map.current) {
      const [west, south, east, north] = series.bounds;
      const lonPadding = Math.max((east - west) * 0.08, 0.0001);
      const latPadding = Math.max((north - south) * 0.08, 0.0001);
      map.current.fitBounds(
        [[west - lonPadding, south - latPadding], [east + lonPadding, north + latPadding]],
        { padding: 40, maxZoom: 16, duration: 0 },
      );
      return;
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={showBaseline ? "default" : "outline"}
          aria-pressed={showBaseline} disabled={compareBlink}
          onClick={() => setShowBaseline((value) => !value)}>
          Первый контур
        </Button>
        <Button type="button" size="sm" variant={compareBlink ? "default" : "outline"}
          aria-pressed={compareBlink} disabled={window.matchMedia("(prefers-reduced-motion: reduce)").matches}
          onClick={() => { setCompareBlink((value) => !value); setBlinkCurrent(true); }}>
          Сравнить миганием
        </Button>
        <Button type="button" size="sm" variant="outline" aria-label="Увеличить карту"
          onClick={() => basemapReady ? map.current?.zoomIn() : setZoom((value) => Math.min(value * 1.5, 32))}>+</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Уменьшить карту"
          onClick={() => basemapReady ? map.current?.zoomOut() : setZoom((value) => Math.max(value / 1.5, 1))}>−</Button>
        <Button type="button" size="sm" variant="outline" onClick={reset}>Сбросить масштаб</Button>
        <span className="text-sm text-muted-foreground">
          {basemapReady ? "Перетаскивайте карту и меняйте масштаб" : `Масштаб ${zoom.toFixed(1)}× · перетаскивайте карту`}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-lg border bg-muted/20">
        <div className="absolute inset-0">
          <div ref={mapContainer} className="h-full w-full" role="group" aria-label="Географическая подложка береговой линии" />
        </div>
        <svg viewBox="0 0 800 490" preserveAspectRatio="none"
          className={`relative block h-[360px] w-full touch-none sm:h-[490px] ${basemapReady ? "pointer-events-none" : "bg-background"}`}
          role="img" aria-label="Сравнение первого и выбранного наблюдений береговой линии"
          onPointerDown={(event) => {
            if (basemapReady) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (basemapReady || !drag) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setOffset((value) => ({
              x: value.x + (event.clientX - drag.x) * 800 / rect.width,
              y: value.y + (event.clientY - drag.y) * 490 / rect.height,
            }));
            setDrag({ x: event.clientX, y: event.clientY });
          }}
          onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
          <g transform={basemapReady ? undefined : `translate(${offset.x} ${offset.y}) translate(400 245) scale(${zoom}) translate(-400 -245)`}>
            {!basemapReady && <path d={fallbackPaths.grid} fill="none" stroke="var(--border)" strokeWidth={1 / zoom} />}
            {(compareBlink ? !blinkCurrent : showBaseline) && <path d={basemapReady ? mapPaths.baseline : fallbackPaths.baseline} fill="none"
              stroke="var(--chart-2)" strokeWidth={basemapReady ? 3 : 3 / zoom}
              strokeDasharray={basemapReady ? "8 5" : `${8 / zoom} ${5 / zoom}`} />}
            {(!compareBlink || blinkCurrent) && <path d={basemapReady ? mapPaths.current : fallbackPaths.current} fill="none"
              stroke="var(--background)" strokeWidth={basemapReady ? 7 : 7 / zoom}
              strokeLinecap="round" strokeLinejoin="round" />}
            {(!compareBlink || blinkCurrent) && <path d={basemapReady ? mapPaths.current : fallbackPaths.current} fill="none" stroke="var(--chart-1)"
              strokeWidth={basemapReady ? 4 : 4 / zoom} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        </svg>
      </div>
      {basemapFailed && !basemapReady && <p role="status" className="text-xs text-muted-foreground">
        Географическая подложка недоступна. Контуры показаны на координатной сетке.
      </p>}
      {basemapReady && <p className="text-xs text-muted-foreground">
        Современная картографическая подложка: {customMapStyleUrl ? "стиль, настроенный оператором; источники указаны на карте" : <>
          <a href="https://openfreemap.org/" target="_blank" rel="noreferrer" className="underline">OpenFreeMap</a>,
          {" "}<a href="https://openmaptiles.org/" target="_blank" rel="noreferrer" className="underline">OpenMapTiles</a>,
          {" "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap</a>
        </>}.
        Это ориентир местности, а не снимок выбранной даты.
      </p>}
      <p className="text-sm text-muted-foreground">
        <span className="text-chart-2">━━</span> первое наблюдение ·{" "}
        <span className="text-chart-1">━━</span> выбранная дата. Контуры показаны в точных координатах,
        без визуального усиления смещения. Для малых изменений увеличьте карту или включите мигание.
      </p>
      <p className="text-xs text-muted-foreground">
        Охват: {series.bounds[0].toFixed(4)}°–{series.bounds[2].toFixed(4)}° в. д.,
        {series.bounds[1].toFixed(4)}°–{series.bounds[3].toFixed(4)}° с. ш. · EPSG:4326
      </p>
    </div>
  );
}

