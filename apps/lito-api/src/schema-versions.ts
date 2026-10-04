export const calculationInputSchemaVersion = 1;
export const calculationResultSchemaVersion = 1;
export const datasetSchemaVersion = 1;

export function assertSupportedInputSchemaVersion(
  version: number | null,
): void {
  if (version !== calculationInputSchemaVersion)
    throw new Error("Неподдерживаемая версия схемы входа расчёта");
}
