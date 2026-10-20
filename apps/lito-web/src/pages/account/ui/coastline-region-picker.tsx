import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { CoastlinePreviewDto, CoastlineRegionBoundsDto } from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { errorMessage } from "../model/use-calculations";

export type RegionFields = Record<keyof CoastlineRegionBoundsDto, string>;
const sea = { west: 27, south: 40.5, east: 42.5, north: 47.5 };

// Только преобразование геометрии для отрисовки; выделение научных линий выполняет Go.
function displayLines(value: unknown): [number, number][][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const object = value as Record<string, unknown>;
  if (object.type === "FeatureCollection" && Array.isArray(object.features)) return object.features.flatMap(displayLines);
  if (object.type === "Feature") return displayLines(object.geometry);
  const coordinates = object.coordinates;
  const line = (points: unknown): [number, number][] => Array.isArray(points) ? points.flatMap((p: unknown) =>
    Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number" && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [[p[0], p[1]] as [number, number]] : []) : [];
  if (object.type === "LineString") return [line(coordinates)];
  if ((object.type === "Polygon" || object.type === "MultiLineString") && Array.isArray(coordinates)) return coordinates.map(line);
  if (object.type === "MultiPolygon" && Array.isArray(coordinates)) return coordinates.flatMap((p: unknown) => Array.isArray(p) ? p.map(line) : []);
  return [];
}

export function CoastlineRegionPicker({ value, onChange, sourceId }: {
  value: RegionFields;
  onChange: (value: RegionFields) => void;
  sourceId?: string;
}) {
  const [preview, setPreview] = useState<CoastlinePreviewDto | null>(null);
  const [error, setError] = useState("");
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState(sea);
  const [first, setFirst] = useState<[number, number] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const sourceKey = sourceId ?? "bundled";
  const loading = loadedSource !== sourceKey;
  const bounds = { west: Number(value.west), south: Number(value.south), east: Number(value.east), north: Number(value.north) };
  const valid = Object.values(bounds).every(Number.isFinite) && Object.values(value).every((v) => v.trim()) &&
    bounds.west >= sea.west && bounds.east <= sea.east && bounds.south >= sea.south && bounds.north <= sea.north && bounds.west < bounds.east && bounds.south < bounds.north;

  useEffect(() => {
    let active = true;
    void (sourceId ? api.scientificCoastline(sourceId) : api.blackSeaCoastline())
      .then((data) => { if (active) { setPreview(data); setError(""); } })
      .catch((reason: unknown) => { if (active) { setPreview(null); setError(errorMessage(reason)); } })
      .finally(() => { if (active) setLoadedSource(sourceKey); });
    return () => { active = false; };
  }, [sourceId, sourceKey, revision]);

  const drawing = useMemo(() => {
    const projection = geoMercator().fitExtent([[20, 20], [780, 430]], { type: "MultiPoint", coordinates: [[view.west, view.south], [view.east, view.north]] });
    const path = geoPath(projection);
    const lines = preview ? displayLines(preview.geojson) : [];
    return { projection, coast: path({ type: "MultiLineString", coordinates: lines }) ?? "" };
  }, [preview, view]);

  function selectCorner(event: PointerEvent<SVGSVGElement>) {
    if (!svg.current || !drawing.projection.invert) return;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const coordinates = drawing.projection.invert([point.x, point.y]);
    if (!coordinates || coordinates[0] < sea.west || coordinates[0] > sea.east || coordinates[1] < sea.south || coordinates[1] > sea.north) return;
    if (!first) setFirst(coordinates);
    else {
      const west = Math.min(first[0], coordinates[0]); const east = Math.max(first[0], coordinates[0]);
      const south = Math.min(first[1], coordinates[1]); const north = Math.max(first[1], coordinates[1]);
      if (east - west > 0.000001 && north - south > 0.000001) onChange({ west: west.toFixed(6), east: east.toFixed(6), south: south.toFixed(6), north: north.toFixed(6) });
      setFirst(null);
    }
  }

  const topLeft = valid ? drawing.projection([bounds.west, bounds.north]) : null;
  const bottomRight = valid ? drawing.projection([bounds.east, bounds.south]) : null;
  const marker = first ? drawing.projection(first) : null;
  return (
    <section aria-labelledby="coastline-region-heading" className="space-y-4 border-t pt-6">
      <h3 id="coastline-region-heading" className="text-lg font-semibold">3. Область побережья</h3>
      <p className="text-sm text-muted-foreground">Отметьте два противоположных угла на карте или введите границы ниже. Go сохранит все попавшие в область участки без упрощения и соединения разрывов.</p>
      {loading ? <p role="status">Загружаем полный контур…</p> : error ? <div role="alert" className="rounded-xl border p-4 text-sm text-destructive">
        Не удалось показать выбранный источник: {error}
        <Button type="button" variant="outline" className="mt-2" onClick={() => { setLoadedSource(null); setRevision((v) => v + 1); }}>Повторить загрузку карты</Button>
      </div> : preview && <div className="space-y-2">
        <svg ref={svg} role="img" aria-label="Карта для выбора области Чёрного моря; границы также доступны в полях ниже" viewBox="0 0 800 450"
          onPointerDown={selectCorner} className="w-full touch-manipulation cursor-crosshair overflow-hidden rounded-xl border bg-muted/35">
          <defs><clipPath id="region-map-clip"><rect x="0" y="0" width="800" height="450" /></clipPath></defs>
          <g clipPath="url(#region-map-clip)">
            <path d={drawing.coast} fill="none" className="stroke-primary" strokeWidth="1.3" />
            {topLeft && bottomRight && <rect x={topLeft[0]} y={topLeft[1]} width={bottomRight[0] - topLeft[0]} height={bottomRight[1] - topLeft[1]} className="fill-primary/15 stroke-primary" strokeWidth="2" strokeDasharray="6 4" />}
            {marker && <circle cx={marker[0]} cy={marker[1]} r="5" className="fill-primary" />}
          </g>
        </svg>
        <p role="status" className="text-sm text-muted-foreground">{first ? "Первый угол отмечен. Выберите второй угол." : "Два нажатия на карту задают область."}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { setView(sea); setFirst(null); }}>Всё Чёрное море</Button>
          <Button type="button" variant="outline" disabled={!valid} onClick={() => { setView(bounds); setFirst(null); }}>Приблизить к области</Button>
          {first && <Button type="button" variant="ghost" onClick={() => setFirst(null)}>Отменить выбор угла</Button>}
        </div>
        <p className="text-xs break-words text-muted-foreground">{preview.source} · {preview.crs} · SHA-256: {preview.sha256.slice(0, 16)}…</p>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {([["west", "Западная долгота, °", 27, 42.5], ["east", "Восточная долгота, °", 27, 42.5], ["south", "Южная широта, °", 40.5, 47.5], ["north", "Северная широта, °", 40.5, 47.5]] as const).map(([key, label, min, max]) => <div key={key} className="space-y-2">
          <Label htmlFor={`region-${key}`}>{label}</Label>
          <Input id={`region-${key}`} type="number" required min={min} max={max} step="any" value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
        </div>)}
      </div>
      {!valid && <p role="alert" className="text-sm text-destructive">Задайте запад меньше востока и юг меньше севера в пределах Чёрного моря.</p>}
    </section>
  );
}
