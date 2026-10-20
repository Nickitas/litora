import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { CalculationKind } from "@litora/contracts";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Проверяет комплект и контрольные суммы Go до публикации первого файла в S3. */
export async function assertResultArtifacts(
  output: string,
  kind: CalculationKind,
  outputs: string[],
): Promise<ReadonlyMap<string, string>> {
  const manifest: unknown = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
  if (!record(manifest) || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0)
    throw new Error("В манифесте Go нет артефактов результата");
  const actual = new Set(outputs.map((path) => relative(output, path).replaceAll("\\", "/")));
  actual.delete("manifest.json");
  actual.delete("execution.log");
  const declared = new Map<string, string>();
  for (const artifact of manifest.artifacts) {
    if (!record(artifact) || typeof artifact.path !== "string" ||
        artifact.path.split("/").some((part) => !part || part === "." || part === "..") ||
        artifact.path.includes("\\") || artifact.path.includes(":") ||
        declared.has(artifact.path) || !actual.has(artifact.path) ||
        typeof artifact.sizeBytes !== "number" || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0 ||
        typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256))
      throw new Error("Некорректный или отсутствующий артефакт в манифесте Go");
    const path = join(output, artifact.path);
    if ((await stat(path)).size !== artifact.sizeBytes)
      throw new Error(`Размер отчёта не совпадает с манифестом Go: ${artifact.path}`);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    if (hash.digest("hex") !== artifact.sha256)
      throw new Error(`Контрольная сумма отчёта не совпадает с манифестом Go: ${artifact.path}`);
    declared.set(artifact.path, artifact.sha256);
  }
  if (declared.size !== actual.size)
    throw new Error("CLI создал файлы, не заявленные в манифесте Go");

  const required: string[] = [];
  if (kind === "coastline_region") required.push("region/selection.json", "region/coastline.geojson", "svg/coastline-region.svg");
  if (["dimension", "dimension_dataset", "dimension_file", "all_demo", "all_file"].includes(kind))
    required.push("metrics/dimension.metrics.json", "svg/dimension_0.svg", "svg/dimension_loglog_0.svg");
  if (kind === "map" || kind === "map_file")
    required.push("svg/black-sea-coast.svg", "metrics/black-sea-coast.geojson");
  if (["erosion", "erosion_file", "all_demo", "all_file"].includes(kind))
    required.push("metrics/erosion.metrics.json", "svg/erosion_step_0.svg", "erosion/longshore-cerc.json", "erosion/visualization/index.json");
  if (kind === "shoreline_data_audit") required.push("shoreline-data-audit.json");
  for (const path of required) {
    if (!declared.has(path)) throw new Error(`CLI не создал обязательный отчёт: ${path}`);
    if ((await stat(join(output, path))).size === 0)
      throw new Error(`CLI создал пустой обязательный отчёт: ${path}`);
  }
  return declared;
}
