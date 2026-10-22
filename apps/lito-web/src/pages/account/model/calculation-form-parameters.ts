import { adaptiveParameterDefinitions, calculationTextParameters } from "@litora/contracts";
import type { AllOptionsDto, CalculationKind, CercCalibrationOptionsDto, CercOptionsDto } from "@litora/contracts";
import { calculationNumericParameters } from "@litora/contracts";

export type CercFormValues = Partial<CercOptionsDto>;
export type AllFormValues = Partial<AllOptionsDto>;
export type CalibrationFormValues = Partial<Omit<CercCalibrationOptionsDto, "bathymetryResolution">> & { cercCoefficients: string };
export type FullFormValues = Partial<Record<"targetEdge" | "boundaryDetail" | "maxSourceDistance" | "coastTransition" | "verticalExaggeration", number>> & {
  generator: string;
  isobaths: string;
  controlPoints: boolean;
};

export function createCercFormValues(): CercFormValues {
  return { ...initialNumericParameters("erosion_file"), outputCsv: false, csvFormat: "long", outputGif: false };
}

export function createAllFormValues(): AllFormValues {
  return { ...initialNumericParameters("all_file"), outputCsv: false, csvFormat: "long", outputGif: false, noModelSimplify: false };
}

export function createCalibrationFormValues(): CalibrationFormValues {
  const numeric = Object.fromEntries(Object.entries(initialNumericParameters("calibrate_cerc")).filter(([key]) => key !== "bathymetryResolution"));
  return { ...numeric, cercCoefficients: "" };
}

export function initialNumericParameter(kind: CalculationKind, field: string): number | undefined {
  return calculationNumericParameters[kind]?.[field]?.defaultValue;
}

export function initialTextParameter(kind: CalculationKind, field: string): string {
  return calculationTextParameters[kind]?.[field]?.defaultValue ?? "";
}

export function initialNumericParameters(kind: CalculationKind): Record<string, number | undefined> {
  return Object.fromEntries(Object.entries(calculationNumericParameters[kind] ?? {}).map(([key, definition]) => [key, definition.defaultValue]));
}

export function initialAdaptiveParameters(): Record<string, string> {
  return Object.fromEntries(Object.entries(adaptiveParameterDefinitions).map(([key, definition]) => [key, definition.defaultValue === undefined ? "" : String(definition.defaultValue)]));
}

export function numericInputValue(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}
