export const calculationInputSchemaVersion = 11;
export const calculationResultSchemaVersion = 1;
export const datasetSchemaVersion = 1;

export function assertSupportedInputSchemaVersion(
  version: number | null,
): void {
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8 && version !== 9 && version !== 10 && version !== calculationInputSchemaVersion)
    throw new Error("Неподдерживаемая версия схемы входа расчёта");
}
