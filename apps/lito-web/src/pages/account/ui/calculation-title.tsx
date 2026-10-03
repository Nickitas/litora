import type { CalculationKindDto } from "@litora/contracts";

export function CalculationTitle({
  kind,
  kinds,
}: {
  kind: string;
  kinds: CalculationKindDto[];
}) {
  return kinds.find((item) => item.kind === kind)?.title ?? kind;
}
