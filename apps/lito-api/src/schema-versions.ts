export const calculationInputSchemaVersion = 3;
export const calculationResultSchemaVersion = 1;
export const datasetSchemaVersion = 1;

export function assertSupportedInputSchemaVersion(
  version: number | null,
): void {
  if (version !== 1 && version !== 2 && version !== calculationInputSchemaVersion)
    throw new Error("Неподдерживаемая версия схемы входа расчёта");
}
