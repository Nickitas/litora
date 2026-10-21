// Только преобразование геометрии для отрисовки; выделение научных линий выполняет Go.
export function displayLines(value: unknown): [number, number][][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const object = value as Record<string, unknown>;
  if (object.type === "FeatureCollection" && Array.isArray(object.features))
    return object.features.flatMap(displayLines);
  if (object.type === "Feature") return displayLines(object.geometry);
  const coordinates = object.coordinates;
  const line = (points: unknown): [number, number][] =>
    Array.isArray(points)
      ? points.flatMap((p: unknown) =>
          Array.isArray(p) &&
          typeof p[0] === "number" &&
          typeof p[1] === "number" &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1])
            ? [[p[0], p[1]] as [number, number]]
            : []
        )
      : [];
  if (object.type === "LineString") return [line(coordinates)];
  if (
    (object.type === "Polygon" || object.type === "MultiLineString") &&
    Array.isArray(coordinates)
  )
    return coordinates.map(line);
  if (object.type === "MultiPolygon" && Array.isArray(coordinates))
    return coordinates.flatMap((p: unknown) =>
      Array.isArray(p) ? p.map(line) : []
    );
  return [];
}

