import type { ComponentProps } from "react";
import { calculationNumericParameters } from "@litora/contracts";
import type { CalculationKind } from "@litora/contracts";
import { Input } from "@/shared/shadcn/components/ui/input";

export function NumericCalculationInput({ kind, parameter, id, value, required = true, min, ...props }:
  Omit<ComponentProps<typeof Input>, "type" | "max" | "step"> & { kind: CalculationKind; parameter: string; id: string }) {
  const definition = calculationNumericParameters[kind]?.[parameter];
  if (!definition) throw new Error(`Не описано числовое поле «${parameter}»`);
  const hintId = `${id}-hint`;
  return (
    <>
      <Input {...props} id={id} type="number" required={required}
        min={min ?? definition.minimum} max={definition.maximum} step={definition.integer ? 1 : "any"}
        value={value ?? ""} aria-describedby={[props["aria-describedby"], hintId].filter(Boolean).join(" ")} />
      <p id={hintId} className="text-xs text-muted-foreground">
        {definition.unit}. Технический диапазон: {min ?? definition.minimum}…{definition.maximum}{definition.integer ? ", целое число" : ""}.
        {definition.excludedValues?.length ? ` Исключены значения: ${definition.excludedValues.join(", ")}.` : ""}
        {definition.defaultValue !== undefined ? ` Начальное значение: ${definition.defaultValue}.` : ""}
        {" "}{definition.guidance}
      </p>
    </>
  );
}
