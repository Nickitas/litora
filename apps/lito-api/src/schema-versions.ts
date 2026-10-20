export const calculationInputSchemaVersion = 14;
export const calculationResultSchemaVersion = 1;
export const datasetSchemaVersion = 1;

export function assertSupportedInputSchemaVersion(
  version: number | null,
): void {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > calculationInputSchemaVersion)
    throw new Error("Неподдерживаемая версия схемы входа расчёта");
}
