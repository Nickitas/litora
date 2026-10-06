import type { CalculationKind } from "@litora/contracts";

export interface ResultMethod {
  id: string;
  revision: string;
}

const expected = {
  source_file: { command: "lito source", id: null },
  dimension: { command: "lito dimension", id: "box-counting" },
  dimension_dataset: { command: "lito dimension", id: "box-counting" },
  dimension_file: { command: "lito dimension", id: "box-counting" },
  map: { command: "lito map", id: "black-sea-overview" },
  map_file: { command: "lito map", id: "black-sea-overview" },
  erosion: { command: "lito erosion", id: "cerc-one-line" },
  mesh: { command: "lito mesh", id: null },
  seabed_build: { command: "lito seabed build", id: null },
  seabed_render: { command: "lito seabed render", id: null },
  seabed_adapt: { command: "lito seabed adapt", id: null },
  seabed_generate_adaptive: { command: "lito seabed generate-adaptive", id: null },
  seabed_validate: { command: "lito seabed validate", id: null },
  seabed_compare_adaptive: { command: "lito seabed compare-adaptive", id: null },
} satisfies Record<CalculationKind, { command: string; id: string | null }>;

export function resultMethodFromManifest(
  bytes: Buffer,
  kind: CalculationKind,
): ResultMethod | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Некорректный манифест результата Go");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Некорректный манифест результата Go");
  const manifest = parsed as Record<string, unknown>;
  const method = manifest.method;
  if (
    manifest.schemaVersion !== 2 ||
    manifest.command !== expected[kind].command
  )
    throw new Error("Манифест Go не соответствует сценарию или версии контракта");
  if (expected[kind].id === null) {
    if (method !== undefined)
      throw new Error("Манифест Go содержит неожиданный метод");
    return null;
  }
  if (!method || typeof method !== "object" || Array.isArray(method))
    throw new Error("В манифесте Go нет метода");
  const identity = method as Record<string, unknown>;
  if (
    identity.id !== expected[kind].id ||
    typeof identity.revision !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(identity.revision)
  )
    throw new Error("В манифесте Go нет допустимой ревизии метода");
  return { id: identity.id, revision: identity.revision };
}
