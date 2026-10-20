export type CoastlineContinuation = {
  kind: "dimension_file" | "erosion_file";
  artifactId: string;
  sourceJobId: string;
};

export function parseCoastlineContinuation(params: URLSearchParams): CoastlineContinuation | undefined {
  const kind = params.get("scenario"); const artifactId = params.get("coastline"); const sourceJobId = params.get("source");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if ((kind !== "dimension_file" && kind !== "erosion_file") || !artifactId || !sourceJobId || !uuid.test(artifactId) || !uuid.test(sourceJobId)) return undefined;
  return { kind, artifactId, sourceJobId };
}

export function coastlineContinuationUrl(value: CoastlineContinuation) {
  return `/lab/calculations?${new URLSearchParams({ new: "1", scenario: value.kind, coastline: value.artifactId, source: value.sourceJobId })}`;
}
