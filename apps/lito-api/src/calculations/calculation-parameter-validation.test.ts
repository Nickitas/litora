import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculationNumericParameters, cercSiteParameterNames, erosionFileDefaults, cercCalibrationDefaults,
  resolveNumericCalculationParameter, resolveTextCalculationParameter, type CalculationKind,
} from "@litora/contracts";
import { validateCalculation, commandArguments } from "./commands.js";
import { calculationParameterSchemas, calculationRequiredInputFields } from "./calculation-parameter-schema.js";

const id = "33333333-3333-4333-8333-333333333333";
const inputs = { coastlineInputId: id, waveInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id };
// Явно выбранные значения транспортных тестов, без научной аттестации участка.
const site = Object.fromEntries(cercSiteParameterNames.map((field) => [field, erosionFileDefaults[field]]));

test("новый CERC требует каждый параметр участка и сохраняет явные нулевые потоки", () => {
  for (const kind of ["erosion_file", "all_file", "calibrate_cerc"] as const) {
    const input = kind === "calibrate_cerc"
      ? { ...cercCalibrationDefaults, ...inputs, observationsInputId: id, bathymetryResolution: 0.005 }
      : { ...site, ...inputs };
    assert.equal(validateCalculation({ kind, input }).input?.leftBoundaryTransport, 0);
    assert.equal(validateCalculation({ kind, input }).input?.rightBoundaryTransport, 0);
    const required = calculationRequiredInputFields(kind).filter((field) => !field.endsWith("Id"));
    for (const field of required) {
      const omitted: Record<string, unknown> = { ...input };
      delete omitted[field];
      assert.throws(() => validateCalculation({ kind, input: omitted }), /Укажите/);
      for (const value of [null, "", "0", NaN, Infinity, -Infinity])
        assert.throws(() => validateCalculation({ kind, input: { ...input, [field]: value } }));
    }
  }
});

test("восстановленные полные параметры CERC продолжают проходить через worker в CLI", () => {
  const saved = validateCalculation({ kind: "erosion_file", input: { ...erosionFileDefaults, ...inputs } });
  assert.deepEqual(validateCalculation(saved), saved);
  const args = commandArguments(saved, "/job/output", undefined, {
    coastlineInputId: "/job/coast.geojson", waveInputId: "/job/waves.csv",
    bathymetryInputId: "/job/grid.json", bathymetryMetadataInputId: "/job/grid.metadata.json",
  }, { waveInputId: "Наблюдения участка" });
  assert.deepEqual(args.slice(args.indexOf("--left-boundary-transport"), args.indexOf("--left-boundary-transport") + 4),
    ["--left-boundary-transport", "0", "--right-boundary-transport", "0"]);
});

test("радиус поиска глубины нельзя подставить при отсутствии данных участка", () => {
  for (const kind of ["seabed_build", "seabed_check_full"] as const) {
    const input = { flatMeshInputId: id, coastlineInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id,
      ...(kind === "seabed_check_full" ? { meshReportInputId: id } : {}) };
    assert.throws(() => validateCalculation({ kind, input }), /Предел поиска глубины/);
    assert.equal(validateCalculation({ kind, input: { ...input, maxSourceDistance: 25000 } }).input?.maxSourceDistance, 25000);
  }
});

test("числовые границы едины для HTTP, формы и Swagger; отсутствие не превращается в ноль", () => {
  for (const [scenario, definitions] of Object.entries(calculationNumericParameters)) {
    const kind = scenario as CalculationKind;
    for (const [field, definition] of Object.entries(definitions)) {
      assert.equal(resolveNumericCalculationParameter(kind, field, definition.minimum), definition.minimum);
      assert.equal(resolveNumericCalculationParameter(kind, field, definition.maximum), definition.maximum);
      assert.throws(() => resolveNumericCalculationParameter(kind, field, definition.minimum - 1));
      assert.throws(() => resolveNumericCalculationParameter(kind, field, definition.maximum + 1));
      for (const value of [null, "", "0", NaN, Infinity, -Infinity])
        assert.throws(() => resolveNumericCalculationParameter(kind, field, value));
      if (definition.integer) assert.throws(() => resolveNumericCalculationParameter(kind, field, definition.minimum + 0.5));
      if (definition.defaultValue === undefined) assert.throws(() => resolveNumericCalculationParameter(kind, field, undefined), /Укажите/);
      else assert.equal(resolveNumericCalculationParameter(kind, field, undefined), definition.defaultValue);
      assert.equal(calculationParameterSchemas[field].minimum, definition.minimum);
      assert.equal(calculationParameterSchemas[field].maximum, definition.maximum);
    }
  }
});

test("API принимает предельный шаг батиметрии Go и отклоняет прежнее широкое значение", () => {
  const input = { ...cercCalibrationDefaults, ...inputs, observationsInputId: id };
  assert.equal(validateCalculation({ kind: "calibrate_cerc", input: { ...input, bathymetryResolution: 0.1 } }).input?.bathymetryResolution, 0.1);
  assert.throws(() => validateCalculation({ kind: "calibrate_cerc", input: { ...input, bathymetryResolution: 0.10001 } }), /0.1/);
});

test("общие списки и зависимые параметры проверяются до запуска Go", () => {
  const input = { coastlineInputId: id };
  for (const cellSizes of ["1", "1000;sh", "1000,", "10,20,30,40,50", "1e3", null])
    assert.throws(() => validateCalculation({ kind: "mesh", input: { ...input, cellSizes } }));
  assert.throws(() => validateCalculation({ kind: "mesh", input: { ...input, cellSizes: "10,20", boundaryDetails: "10,20,30" } }), /Количество детализаций/);
  assert.throws(() => validateCalculation({ kind: "seabed_adapt", input: { modelInputId: id, sourceMetadataInputId: id, minSize: 1000 } }), /min ≤ coast/);
  assert.equal(resolveTextCalculationParameter("seabed_compare_adaptive", "detailPreset", undefined), "none");
  assert.equal(resolveTextCalculationParameter("mesh", "cellSizes", undefined), "1000");
  assert.throws(() => resolveTextCalculationParameter("calibrate_cerc", "cercCoefficients", undefined), /Укажите/);
});
