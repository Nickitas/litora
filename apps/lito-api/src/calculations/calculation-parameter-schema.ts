import {
  calculationNumericParameters, calculationTextParameters, scientificInputRequirements,
  type CalculationKind,
} from "@litora/contracts";
import type { SchemaObject } from "@nestjs/swagger";

/** Описания Swagger из тех же ограничений, которые проверяют API и форма. */
export const calculationParameterSchemas: Record<string, SchemaObject> = {};
for (const [kind, definitions] of Object.entries(calculationNumericParameters)) {
  for (const [field, definition] of Object.entries(definitions)) {
    const previous = calculationParameterSchemas[field];
    const selection = definition.defaultValue === undefined ? "Обязателен, без подстановки." : `Техническое начальное значение: ${definition.defaultValue}.`;
    const description = `${kind}: ${selection} ${definition.guidance}`;
    calculationParameterSchemas[field] = {
      type: definition.integer ? "integer" : "number",
      minimum: definition.minimum, maximum: definition.maximum,
      ...(definition.excludedValues?.length ? { not: { enum: [...definition.excludedValues] } } : {}),
      description: previous ? `${previous.description} ${description}` : `${definition.label}, ${definition.unit}. ${description}`,
    };
  }
}
for (const [kind, definitions] of Object.entries(calculationTextParameters)) {
  for (const [field, definition] of Object.entries(definitions)) {
    const previous = calculationParameterSchemas[field];
    const selection = definition.defaultValue === undefined ? "Обязателен, без подстановки." : `Начальное значение: ${definition.defaultValue}.`;
    const description = `${kind}: ${selection} ${definition.guidance}`;
    calculationParameterSchemas[field] = { type: "string",
      ...(definition.allowedValues ? { enum: [...definition.allowedValues] } : {}),
      description: previous ? `${previous.description} ${description}` : description };
  }
}

/** Обязательные входы зависят от сценария; числовые и текстовые значения не подменяют файлы. */
export function calculationRequiredInputFields(kind: CalculationKind): string[] {
  const references = kind in scientificInputRequirements
    ? Object.keys(scientificInputRequirements[kind as keyof typeof scientificInputRequirements])
    : kind === "dimension_dataset" || kind === "dataset_validation" ? ["datasetId"] : [];
  return [...references,
    ...Object.entries(calculationNumericParameters[kind] ?? {}).filter(([, definition]) => definition.defaultValue === undefined).map(([field]) => field),
    ...Object.entries(calculationTextParameters[kind] ?? {}).filter(([, definition]) => definition.defaultValue === undefined).map(([field]) => field),
  ];
}
