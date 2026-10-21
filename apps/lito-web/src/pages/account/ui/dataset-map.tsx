import { useEffect, useMemo, useRef, useState } from "react";
import { geoIdentity, geoPath } from "d3-geo";
import type { GeoJsonLineStringDto } from "@litora/contracts";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Button } from "@/shared/shadcn/components/ui/button";

export function DatasetMap({ geometry }: { geometry: GeoJsonLineStringDto }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [screen, setScreen] = useState({ line: "", box: "" });
  const [zoom, setZoom] = useState(1);
  // Охват и проекция нужны только для отображения; научные метрики здесь не вычисляются.
  const drawing = useMemo(() => {
    const longitudes = geometry.coordinates.map((point) => point[0]);
    const latitudes = geometry.coordinates.map((point) => point[1]);
    const west = Math.min(...longitudes),
      east = Math.max(...longitudes);
    const south = Math.min(...latitudes),
      north = Math.max(...latitudes);
    const bounds = [
      [west, south],
      [east, north],
    ] as [[number, number], [number, number]];
    const padX = Math.max((east - west) * 0.1, 0.0001);
    const padY = Math.max((north - south) * 0.1, 0.0001);
    const projection = geoIdentity()
      .reflectY(true)
      .fitExtent(
        [
          [40, 40],
          [760, 380],
        ],
        {
          type: "MultiPoint",
          coordinates: [
            [west - padX, south - padY],
            [east + padX, north + padY],
          ],
        }
      );
    const box: [number, number][] = [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ];
    const path = geoPath(projection);
    return {
      bounds,
      box,
      line: path(geometry) ?? "",
      outline: path({ type: "LineString", coordinates: box }) ?? "",
    };
  }, [geometry]);

  useEffect(() => {
    let active = true;
    let instance: MapLibreMap | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let frame = 0;
    const timeout = window.setTimeout(() => {
      if (active) setFailed(true);
    }, 12000);
    void import("maplibre-gl")
      .then(({ Map, ScaleControl, setWorkerUrl }) => {
        if (!active || !container.current) return;
        if (drawing.bounds[0][1] < -85 || drawing.bounds[1][1] > 85) {
          setFailed(true);
          return;
        }
        setWorkerUrl(mapWorkerUrl);
        instance = new Map({
          container: container.current,
          style:
            import.meta.env.VITE_MAP_STYLE_URL?.trim() ||
            "https://tiles.openfreemap.org/styles/liberty",
          attributionControl: { compact: true },
          locale: { "AttributionControl.ToggleAttribution": "Показать источники карты" },
          dragRotate: false,
          pitchWithRotate: false,
          center: [
            drawing.bounds[0][0],
            Math.max(-85, Math.min(85, drawing.bounds[0][1])),
          ],
          zoom: 8,
        });
        map.current = instance;
        instance
          .getCanvas()
          .setAttribute(
            "aria-label",
            "Карта береговой линии; масштаб и охват также доступны кнопками ниже"
          );
        instance.addControl(
          new ScaleControl({ maxWidth: 100, unit: "metric" }),
          "bottom-left"
        );
        let loaded = false;
        const project = () => {
          if (!active || !loaded || !instance || !container.current) return;
          const width = container.current.clientWidth,
            height = container.current.clientHeight;
          if (!width || !height) return;
          const path = (points: [number, number][]) =>
            points
              .map((point, index) => {
                const projected = instance!.project(point);
                return `${index ? "L" : "M"}${(projected.x * 800) / width},${(projected.y * 420) / height}`;
              })
              .join(" ");
          setScreen({
            line: path(geometry.coordinates),
            box: path(drawing.box),
          });
        };
        const schedule = () => {
          if (frame) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            project();
          });
        };
        resizeObserver = new ResizeObserver(() => {
          if (!active || !instance) return;
          instance.resize();
          if (loaded) {
            instance.fitBounds(drawing.bounds, { padding: 45, maxZoom: 16, duration: 0 });
            schedule();
          }
        });
        resizeObserver.observe(container.current);
        instance.on("load", () => {
          if (!active || !instance) return;
          loaded = true;
          instance.resize();
          instance.fitBounds(drawing.bounds, {
            padding: 45,
            maxZoom: 16,
            duration: 0,
          });
          project();
          setReady(true);
          window.clearTimeout(timeout);
        });
        instance.on("move", schedule);
        instance.on("resize", schedule);
        instance.on("render", schedule);
        instance.on("error", () => {
          if (active) setFailed(true);
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      instance?.remove();
      map.current = null;
    };
  }, [geometry, drawing]);

  const basemap = ready && !failed;
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-background">
        <div className="absolute inset-0 z-0" aria-hidden={!basemap} inert={!basemap}>
          <div ref={container} className="h-full w-full" />
        </div>
        <svg
          role="img"
          aria-label="Береговая линия и её географический охват"
          viewBox="0 0 800 420"
        preserveAspectRatio={basemap ? "none" : "xMidYMid meet"}
          className={`relative z-10 block h-[300px] w-full sm:h-[420px] ${basemap ? "pointer-events-none" : "bg-background"}`}
        >
          <g
            transform={
              basemap
                ? undefined
                : `translate(400 210) scale(${zoom}) translate(-400 -210)`
            }
          >
            {!basemap && (
              <path
                d="M200 0V420M400 0V420M600 0V420M0 105H800M0 210H800M0 315H800"
                fill="none"
                className="stroke-border"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={basemap ? screen.box : drawing.outline}
              fill="none"
              className="stroke-background"
              strokeWidth="4"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-testid="dataset-map-bounds"
              d={basemap ? screen.box : drawing.outline}
              fill="none"
              className="stroke-muted-foreground"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={basemap ? screen.line : drawing.line}
              fill="none"
              className="stroke-background"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-testid="dataset-map-line"
              d={basemap ? screen.line : drawing.line}
              fill="none"
              className="stroke-primary"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label="Увеличить карту"
          onClick={() =>
            basemap
              ? map.current?.zoomIn()
              : setZoom((value) => Math.min(16, value * 1.5))
          }
        >
          +
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Уменьшить карту"
          onClick={() =>
            basemap
              ? map.current?.zoomOut()
              : setZoom((value) => Math.max(1, value / 1.5))
          }
        >
          −
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setZoom(1);
            if (basemap)
              map.current?.fitBounds(drawing.bounds, {
                padding: 45,
                maxZoom: 16,
                duration: 0,
              });
          }}
        >
          Показать весь участок
        </Button>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {basemap
          ? "Современная подложка для ориентира, а не снимок даты источника. Источники указаны на карте."
          : failed
            ? "Географическая подложка недоступна. Линия показана на координатной сетке WGS84."
            : "Подложка загружается. Линия уже доступна на координатной сетке WGS84."}
      </p>
      <dl
        aria-label="Границы участка"
        className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
      >
        {[
          ["Западная долгота", drawing.bounds[0][0]],
          ["Восточная долгота", drawing.bounds[1][0]],
          ["Южная широта", drawing.bounds[0][1]],
          ["Северная широта", drawing.bounds[1][1]],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 tabular-nums">{Number(value).toFixed(6)}°</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Сплошная линия — сохранённый берег, пунктир — его охват. Координаты:
        EPSG:4326, [долгота, широта].
      </p>
    </div>
  );
}
