/** Не копирует закрытый ключ AI-01 в общую сводку расчёта и паспорт. */
export function includeJsonMetric(relativePath: string, sizeBytes: number): boolean {
  const path = relativePath.replaceAll("\\", "/");
  return path.endsWith(".json") && sizeBytes <= 128_000 &&
    path !== "seabed/expert-set/organizer-key.json";
}
