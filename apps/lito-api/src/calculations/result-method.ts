import type { CalculationKind } from "@litora/contracts";

export interface ResultMethod {
  id: string;
  revision: string;
}

const expected = {
  dimension: { command: "lito dimension", id: "box-counting" },
  dimension_dataset: { command: "lito dimension", id: "box-counting" },
  map: { command: "lito map", id: "black-sea-overview" },
  erosion: { command: "lito erosion", id: "cerc-one-line" },
} satisfies Record<CalculationKind, { command: string; id: string }>;

export function resultMethodFromManifest(
  bytes: Buffer,
  kind: CalculationKind,
): ResultMethod {
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
    manifest.command !== expected[kind].command ||
    !method ||
    typeof method !== "object" ||
    Array.isArray(method)
  )
    throw new Error("Манифест Go не соответствует сценарию или версии контракта");
  const identity = method as Record<string, unknown>;
  if (
    identity.id !== expected[kind].id ||
    typeof identity.revision !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(identity.revision)
  )
    throw new Error("В манифесте Go нет допустимой ревизии метода");
  return { id: identity.id, revision: identity.revision };
}
