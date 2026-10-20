import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScientificInputFormatDto, ScientificInputRole } from "@litora/contracts";
import { environment } from "../config/environment.js";

let cached: ScientificInputFormatDto[] | undefined;

export function scientificInputFormats(): ScientificInputFormatDto[] {
  if (cached) return cached;
  const data: unknown = JSON.parse(readFileSync(join(environment.cliDirectory, "data/schemas/scientific-inputs-v1.json"), "utf8"));
  if (!Array.isArray(data) || data.length !== 19 || data.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return true;
    const value = entry as Record<string, unknown>;
    return typeof value.role !== "string" || value.schemaVersion !== 1 ||
      !["json", "csv", "tsv", "msh2"].includes(String(value.format)) ||
      typeof value.maxBytes !== "number" || !Number.isSafeInteger(value.maxBytes) || value.maxBytes < 1 ||
      typeof value.description !== "string";
  })) throw new Error("Повреждён закреплённый каталог научных форматов");
  cached = data as ScientificInputFormatDto[];
  return cached;
}

export function scientificInputFormat(role: ScientificInputRole) {
  const format = scientificInputFormats().find((item) => item.role === role);
  if (!format) throw new Error("Нет фиксированного формата для научной роли");
  return format;
}
