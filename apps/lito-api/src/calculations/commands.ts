import { BadRequestException } from "@nestjs/common";
import { bundledBlackSeaPath } from "./input-provenance.js";
import { findCalculationReport, calculationParameterCombinationError, adaptiveParameterDefinitions, aiNecessityDefaults, allFileDefaults, cercCalibrationDefaults, erosionFileDefaults, expertSetDefaults, optionalScientificInputRequirements, retiredCalculationKinds, resolveNumericCalculationParameter, resolveTextCalculationParameter, scientificInputRequirements } from "@litora/contracts";
import type {
  CalculationKind,
  CalculationKindDto,
  CreateCalculationDto,
  CercOptionsDto,
  AllOptionsDto,
  CercCalibrationOptionsDto,
  ScientificInputRole,
} from "@litora/contracts";

export const calculationKinds: CalculationKindDto[] = [
  { kind: "coastline_region", title: "Выбрать участок побережья", description: "Любая область Чёрного моря из полного контура или своего GeoJSON: карта и отдельные линии для следующих расчётов." },
  { kind: "source_file", title: "Проверить источник береговой линии", description: "Инспекция и снимок источника Go для совместимости прежних запросов.", selectable: false },
  { kind: "coastline_validation", title: "Проверка геометрии научного контура", description: "Служебная проверка загруженного GeoJSON в Go.", selectable: false },
  { kind: "dataset_validation", title: "Проверка геометрии малого набора", description: "Служебная проверка загруженной береговой линии в Go.", selectable: false },
  { kind: "dimension", title: "Фрактальная размерность", description: "Box-counting полного закреплённого контура MarineRegions: карта, регрессия и метрики." },
  { kind: "dimension_dataset", title: "Размерность своей береговой линии", description: "Box-counting небольшого GeoJSON LineString." },
  { kind: "dimension_file", title: "Размерность полного контура", description: "Box-counting загруженного GeoJSON, включая полный контур Чёрного моря." },
  { kind: "map", title: "Карта Чёрного моря", description: "Полный закреплённый контур MarineRegions: обзорная SVG и GeoJSON." },
  { kind: "map_file", title: "Карта своего контура", description: "Обзорная SVG и GeoJSON по загруженному контуру Чёрного моря." },
  { kind: "erosion", title: "Эрозия: историческая демонстрация Сочи", description: "Только чтение прежних результатов. Для нового расчёта выберите собственные входы.", selectable: false },
  { kind: "erosion_file", title: "Эрозия по своим данным", description: "CERC по загруженным контуру, волнам и батиметрии с проверяемым паспортом; не калиброванный прогноз." },
  { kind: "all_demo", title: "Исторический демонстрационный конвейер Сочи", description: "Только чтение прежних результатов. Для нового расчёта выберите собственные входы.", selectable: false },
  { kind: "all_file", title: "Полный конвейер по своим данным", description: "Проверка контура, размерность, CERC и баланс наносов по загруженным файлам; не калиброванный прогноз." },
  { kind: "calibrate_cerc", title: "Калибровка CERC по наблюдениям", description: "Сравнение коэффициентов CERC с независимыми годовыми скоростями береговой линии и фактическим годовым волновым рядом." },
  { kind: "shoreline_data_audit", title: "Аудит ряда береговой линии", description: "Проверка дат, пробелов, точности и покрытия волнами в Go; без прогноза." },
  { kind: "mesh", title: "Плоская сетка Чёрного моря", description: "Gmsh строит MSH и SVG обзоры сеток по загруженному полному контуру." },
  { kind: "seabed_build", title: "Построить модель дна", description: "Назначить глубины плоской сетке и получить MSH, VTU, CSV и паспорт экспорта." },
  { kind: "seabed_render", title: "Карты и 3D-рельеф дна", description: "SVG карты глубин, фрагментов фактической сетки, 3D-рельефа и профилей из готовой модели MSH." },
  { kind: "seabed_adapt", title: "Поле размера адаптивной сетки", description: "CSV, JSON и SVG поля h(x,y) из принятой модели дна." },
  { kind: "seabed_generate_adaptive", title: "Построить адаптивную сетку", description: "Gmsh создаёт фактическую full-quad MSH из поля размера ADAPT-01." },
  { kind: "seabed_validate", title: "Проверить модель дна", description: "Сравнение с отдельной опорной моделью: глубины, изобаты, уклоны и размеры." },
  { kind: "seabed_compare_adaptive", title: "Сравнение генераторов сетки", description: "Сравнение Gmsh на общем поле и контуре; MSH, SVG и отчёты. Тяжёлый расчёт." },
  { kind: "seabed_assess_ml", title: "Оценить необходимость ML", description: "AI-02 сопоставляет приватные экспертные оценки с ADAPT-03; формирует проверяемый отчёт, не обучает аттестованную модель." },
  { kind: "seabed_check_full", title: "Проверка полного контура Чёрного моря", description: "QA-03 по проверенной плоской MSH, отчёту генерации, контуру и батиметрии; не публикационная аттестация." },
];

export const scientificInputFields = scientificInputRequirements;

export function resourceProfileForKind(kind: CalculationKind) {
  return kind === "source_file" || kind === "coastline_validation" || kind === "dimension_file" || kind === "map_file" ||
    kind === "mesh" || kind === "erosion_file" || kind === "all_file" || kind === "calibrate_cerc" || kind.startsWith("seabed_")
    ? "heavy" : "standard";
}

export function scientificReferences(job: CreateCalculationDto) {
  const fields = scientificInputFields[job.kind as keyof typeof scientificInputFields];
  if (!fields) return [] as { field: string; id: string; role: ScientificInputRole }[];
  const input = job.input ?? {};
  const optional = optionalScientificInputRequirements[job.kind as keyof typeof optionalScientificInputRequirements];
  return Object.entries({ ...fields, ...optional }).filter(([field]) =>
    Object.hasOwn(fields, field) || input[field] !== undefined
  ).map(([field, role]) => ({
    field,
    id: String(input[field]),
    role: role as ScientificInputRole,
  }));
}

export function listCalculationKinds(heavyEnabled: boolean, includeUnavailable: unknown = undefined): CalculationKindDto[] {
  if (includeUnavailable !== undefined && includeUnavailable !== "true" && includeUnavailable !== "false")
    throw new BadRequestException("includeUnavailable должен быть true или false");
  return calculationKinds
    .filter((item) => includeUnavailable === "true" || heavyEnabled || resourceProfileForKind(item.kind) === "standard")
    .map((item) => {
      if (retiredCalculationKinds.some((kind) => kind === item.kind))
        return { ...item, available: false, unavailableReason: "Демонстрационный сценарий удалён. Выберите реальные входные данные." };
      if (!heavyEnabled && resourceProfileForKind(item.kind) === "heavy")
        return { ...item, available: false, unavailableReason: "Тяжёлые расчёты отключены на сервере. Доступность настраивает администратор." };
      return { ...item, available: true };
    });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reportOptions(kind: CalculationKind, value: unknown): Record<string, string> {
  if (value === undefined) return {};
  const report = findCalculationReport(kind, value);
  if (!report) throw new BadRequestException("Подтип отчёта не поддерживается выбранным расчётом");
  return { reportType: report.type };
}

function numberIn(value: unknown, label: string, minimum: number, maximum: number, integer = false) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < minimum || value > maximum || (integer && !Number.isInteger(value))
  ) throw new BadRequestException(`Недопустимое значение «${label}»`);
  return value;
}

function numericParameter(kind: CalculationKind, field: string, value: unknown): number {
  try { return resolveNumericCalculationParameter(kind, field, value); }
  catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : "Недопустимый числовой параметр");
  }
}

function stringParameter(kind: CalculationKind, field: string, value: unknown): string {
  try { return resolveTextCalculationParameter(kind, field, value); }
  catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "Недопустимый текстовый параметр"); }
}

function assertParameterCombination(kind: CalculationKind, input: Record<string, unknown>) {
  const error = calculationParameterCombinationError(kind, input);
  if (error) throw new BadRequestException(error);
}

function rejectUnknown(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new BadRequestException("Недопустимые параметры расчёта");
}

function optionalUtcDay(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException("Дата начала проверки должна быть ГГГГ-ММ-ДД UTC");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new BadRequestException("Некорректная календарная дата начала проверки");
  return value;
}

function references(input: Record<string, unknown>, fields: Record<string, ScientificInputRole>) {
  const result: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    if (typeof input[key] !== "string" || !uuid.test(input[key]))
      throw new BadRequestException(`Укажите UUID файла «${key}»`);
    result[key] = input[key];
  }
  return result;
}

function optionalReferences(input: Record<string, unknown>, kind: keyof typeof optionalScientificInputRequirements) {
  const result: Record<string, string> = {};
  for (const key of Object.keys(optionalScientificInputRequirements[kind])) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || !uuid.test(input[key]))
      throw new BadRequestException(`Укажите UUID файла «${key}»`);
    result[key] = input[key];
  }
  return result;
}




function expertOptions(input: Record<string, unknown>, levels: string, generators: string) {
  if (input.generateExpertSet !== undefined && typeof input.generateExpertSet !== "boolean")
    throw new BadRequestException("Недопустимый флаг экспертных карточек");
  if (input.generateExpertSet !== true) {
    if (input.expertLevels !== undefined || input.expertSeed !== undefined)
      throw new BadRequestException("Параметры AI-01 требуют включить экспертные карточки");
    return { generateExpertSet: false };
  }
  if (generators.split(",").length < 2)
    throw new BadRequestException("Для экспертных карточек нужны минимум два генератора");
  const selected = input.expertLevels ?? expertSetDefaults.expertLevels;
  if (typeof selected !== "string" || (selected !== "" && !/^[a-z][a-z0-9_-]{0,31}(,[a-z][a-z0-9_-]{0,31}){0,3}$/.test(selected)))
    throw new BadRequestException("Недопустимый список уровней AI-01");
  const available = new Set(levels.split(",").map((level) => level.split(":")[0]));
  const selectedIds = selected === "" ? [] : selected.split(",");
  if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !available.has(id)))
    throw new BadRequestException("Уровни AI-01 должны быть уникальными уровнями сравнения");
  const seed = input.expertSeed ?? expertSetDefaults.expertSeed;
  if (typeof seed !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(seed))
    throw new BadRequestException("Строка анонимизации AI-01: 1–80 латинских букв, цифр, - или _");
  return { generateExpertSet: true, expertLevels: selected, expertSeed: seed };
}

function figureFiveOptions(
  input: Record<string, unknown>, levels: string, generators: string,
  expert: ReturnType<typeof expertOptions>,
) {
  if (input.generateFigureFive !== undefined && typeof input.generateFigureFive !== "boolean")
    throw new BadRequestException("Недопустимый флаг рисунка 5");
  if (input.generateFigureFive !== true) {
    if (input.figureFiveLevel !== undefined || input.figureFiveGenerator !== undefined)
      throw new BadRequestException("Уровень и генератор рисунка 5 требуют включить его сборку");
    return { generateFigureFive: false };
  }
  if (!expert.generateExpertSet)
    throw new BadRequestException("Для рисунка 5 нужны экспертные карточки AI-01");
  const level = input.figureFiveLevel;
  const generator = input.figureFiveGenerator;
  const availableLevels = levels.split(",").map((item) => item.split(":")[0]);
  const selectedExpertLevels = expert.expertLevels ?? "";
  const expertLevels = selectedExpertLevels === "" ? availableLevels : selectedExpertLevels.split(",");
  if (typeof level !== "string" || !expertLevels.includes(level))
    throw new BadRequestException("Уровень рисунка 5 должен входить в уровни AI-01");
  if (typeof generator !== "string" || !generators.split(",").includes(generator))
    throw new BadRequestException("Генератор рисунка 5 должен входить в сравнение ADAPT-03");
  return { generateFigureFive: true, figureFiveLevel: level, figureFiveGenerator: generator };
}


function validateCercOptions(
  input: Record<string, unknown>,
  defaults: CercOptionsDto,
): CercOptionsDto {
  if (input.outputCsv !== undefined && typeof input.outputCsv !== "boolean")
    throw new BadRequestException("Недопустимый флаг экспорта CSV");
  if (input.csvFormat !== undefined && input.csvFormat !== "long" && input.csvFormat !== "wide")
    throw new BadRequestException("Формат CSV должен быть long или wide");
  if (input.outputGif !== undefined && typeof input.outputGif !== "boolean")
    throw new BadRequestException("Недопустимый флаг экспорта GIF");
  const ownFullSeries = defaults.svgMaxFrames !== undefined;
  const steps = numericParameter("erosion_file", "steps", input.steps);
  const svgMaxFrames = ownFullSeries
    ? numericParameter("erosion_file", "svgMaxFrames", input.svgMaxFrames)
    : undefined;
  const outputGif = input.outputGif ?? defaults.outputGif;
  const outputCsv = input.outputCsv ?? defaults.outputCsv;
  const csvFormat = input.csvFormat ?? defaults.csvFormat;
  const options: CercOptionsDto = {
    steps,
    ...(svgMaxFrames !== undefined ? { svgMaxFrames } : {}),
    breakingIndex: numericParameter("erosion_file", "breakingIndex", input.breakingIndex),
    bermHeight: numericParameter("erosion_file", "bermHeight", input.bermHeight),
    closureDepth: numericParameter("erosion_file", "closureDepth", input.closureDepth),
    porosity: numericParameter("erosion_file", "porosity", input.porosity),
    cercCoefficient: numericParameter("erosion_file", "cercCoefficient", input.cercCoefficient),
    offshoreSampleDistance: numericParameter("erosion_file", "offshoreSampleDistance", input.offshoreSampleDistance),
    maxShorelineChange: numericParameter("erosion_file", "maxShorelineChange", input.maxShorelineChange),
    maxBathymetryGap: numericParameter("erosion_file", "maxBathymetryGap", input.maxBathymetryGap),
    leftBoundaryTransport: numericParameter("erosion_file", "leftBoundaryTransport", input.leftBoundaryTransport),
    rightBoundaryTransport: numericParameter("erosion_file", "rightBoundaryTransport", input.rightBoundaryTransport),
    outputCsv,
    csvFormat,
    outputGif,
    gifFps: numericParameter("erosion_file", "gifFps", input.gifFps),
    gifSkip: numericParameter("erosion_file", "gifSkip", input.gifSkip),
  };
  assertParameterCombination("erosion_file", { ...options });
  return options;
}

function cercArguments(input: Record<string, string | number | boolean | undefined>) {
  return ["--steps", String(input.steps),
    ...(input.steps === 0 ? [
      "--svg-max-frames", String(input.svgMaxFrames),
      "--max-wave-conditions", "10000",
      "--max-coast-points", "200",
    ] : []),
    "--breaking-index", String(input.breakingIndex),
    "--berm-height", String(input.bermHeight),
    "--closure-depth", String(input.closureDepth),
    "--porosity", String(input.porosity),
    "--cerc-coefficient", String(input.cercCoefficient),
    "--offshore-sample-distance", String(input.offshoreSampleDistance),
    "--max-shoreline-change", String(input.maxShorelineChange),
    "--max-bathymetry-gap", String(input.maxBathymetryGap),
    "--left-boundary-transport", String(input.leftBoundaryTransport),
    "--right-boundary-transport", String(input.rightBoundaryTransport)];
}

function validateAllOptions(
  input: Record<string, unknown>,
  defaults: AllOptionsDto,
): AllOptionsDto {
  if (input.noModelSimplify !== undefined && typeof input.noModelSimplify !== "boolean")
    throw new BadRequestException("Недопустимый флаг упрощения модели");
  const modelMaxPoints = numericParameter("all_file", "modelMaxPoints", input.modelMaxPoints);
  const options: AllOptionsDto = {
    ...validateCercOptions(input, defaults),
    modelMaxPoints,
    noModelSimplify: input.noModelSimplify ?? defaults.noModelSimplify,
  };
  assertParameterCombination("all_file", { ...options });
  return options;
}

function allExportArguments(input: Record<string, string | number | boolean | undefined>) {
  return [
    ...(input.outputCsv ? ["--output-csv", "all-metrics.csv", "--csv-format", String(input.csvFormat)] : []),
    ...(input.outputGif ? ["--output-gif", "all-animation.gif", "--gif-fps", String(input.gifFps), "--gif-skip", String(input.gifSkip)] : []),
    ...(input.modelMaxPoints ? ["--model-max-points", String(input.modelMaxPoints)] : []),
    ...(input.noModelSimplify ? ["--no-model-simplify"] : []),
  ];
}


function validateCalibrationOptions(input: Record<string, unknown>): CercCalibrationOptionsDto {
  return {
    bathymetryResolution: numericParameter("calibrate_cerc", "bathymetryResolution", input.bathymetryResolution),
    cercCoefficients: stringParameter("calibrate_cerc", "cercCoefficients", input.cercCoefficients),
    maxObservationDistance: numericParameter("calibrate_cerc", "maxObservationDistance", input.maxObservationDistance),
    minWaveHours: numericParameter("calibrate_cerc", "minWaveHours", input.minWaveHours),
    breakingIndex: numericParameter("calibrate_cerc", "breakingIndex", input.breakingIndex),
    bermHeight: numericParameter("calibrate_cerc", "bermHeight", input.bermHeight),
    closureDepth: numericParameter("calibrate_cerc", "closureDepth", input.closureDepth),
    porosity: numericParameter("calibrate_cerc", "porosity", input.porosity),
    offshoreSampleDistance: numericParameter("calibrate_cerc", "offshoreSampleDistance", input.offshoreSampleDistance),
    maxBathymetryGap: numericParameter("calibrate_cerc", "maxBathymetryGap", input.maxBathymetryGap),
    leftBoundaryTransport: numericParameter("calibrate_cerc", "leftBoundaryTransport", input.leftBoundaryTransport),
    rightBoundaryTransport: numericParameter("calibrate_cerc", "rightBoundaryTransport", input.rightBoundaryTransport),
  };
}

export function validateCalculation(body: unknown): CreateCalculationDto {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Ожидается объект расчёта");
  const data = body as Record<string, unknown>;
  if (retiredCalculationKinds.some((kind) => kind === data.kind))
    throw new BadRequestException("Демонстрационный сценарий удалён. Выберите реальные входные данные для erosion_file или all_file.");
  if (Object.keys(data).some((key) => !["kind", "input"].includes(key)) ||
      !calculationKinds.some((item) => item.kind === data.kind))
    throw new BadRequestException("Неизвестный тип расчёта или поле");
  const input = data.input ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("input должен быть объектом");
  const p = input as Record<string, unknown>;
  switch (data.kind) {
    case "coastline_region": {
      rejectUnknown(p, ["west", "south", "east", "north", "coastlineInputId"]);
      const west = numericParameter(data.kind as CalculationKind, "west", p.west);
      const east = numericParameter(data.kind as CalculationKind, "east", p.east);
      const south = numericParameter(data.kind as CalculationKind, "south", p.south);
      const north = numericParameter(data.kind as CalculationKind, "north", p.north);
      assertParameterCombination("coastline_region", { west, east, south, north });
      return { kind: "coastline_region", input: { west, east, south, north, ...optionalReferences(p, "coastline_region") } };
    }
    case "dimension":
      rejectUnknown(p, ["reportType"]);
      return { kind: data.kind, input: reportOptions(data.kind, p.reportType) };
    case "map":
      rejectUnknown(p, []);
      return { kind: data.kind, input: {} };
    case "dimension_dataset":
      rejectUnknown(p, ["datasetId", "reportType"]);
      return { kind: data.kind, input: { ...references(p, { datasetId: "coastline_geojson" }), ...reportOptions(data.kind, p.reportType) } };
    case "dataset_validation":
      rejectUnknown(p, ["datasetId"]);
      return { kind: data.kind, input: references(p, { datasetId: "coastline_geojson" }) };
    case "dimension_file":
      rejectUnknown(p, ["coastlineInputId", "reportType"]);
      return { kind: "dimension_file", input: { ...references(p, scientificInputFields.dimension_file), ...reportOptions(data.kind, p.reportType) } };
    case "source_file":
    case "coastline_validation":
    case "map_file":
      rejectUnknown(p, ["coastlineInputId"]);
      return { kind: data.kind, input: references(p, scientificInputFields[data.kind]) };
    case "erosion_file": {
      const fields = scientificInputFields.erosion_file;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(optionalScientificInputRequirements.erosion_file), ...Object.keys(erosionFileDefaults)]);
      return { kind: "erosion_file", input: {
        ...references(p, fields),
        ...optionalReferences(p, "erosion_file"),
        ...validateCercOptions(p, erosionFileDefaults),
      } };
    }
    case "all_file": {
      const fields = scientificInputFields.all_file;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(optionalScientificInputRequirements.all_file), ...Object.keys(allFileDefaults)]);
      const options = validateAllOptions(p, allFileDefaults);
      const optional = optionalReferences(p, "all_file");
      if (Object.keys(optional).length && (!options.noModelSimplify || options.modelMaxPoints !== 0))
        throw new BadRequestException("Индексные профили требуют отключить упрощение модели и оставить лимит точек равным 0");
      return { kind: "all_file", input: {
        ...references(p, fields),
        ...optional,
        ...options,
      } };
    }
    case "calibrate_cerc": {
      const fields = scientificInputFields.calibrate_cerc;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(optionalScientificInputRequirements.calibrate_cerc), ...Object.keys(cercCalibrationDefaults), "bathymetryResolution"]);
      return { kind: "calibrate_cerc", input: {
        ...references(p, fields), ...optionalReferences(p, "calibrate_cerc"), ...validateCalibrationOptions(p),
      } };
    }
    case "shoreline_data_audit": {
      const fields = scientificInputFields.shoreline_data_audit;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(optionalScientificInputRequirements.shoreline_data_audit), "validationStart"]);
      const validationStart = optionalUtcDay(p.validationStart);
      return { kind: "shoreline_data_audit", input: {
        ...references(p, fields), ...optionalReferences(p, "shoreline_data_audit"),
        ...(validationStart ? { validationStart } : {}),
      } };
    }
    case "mesh": {
      const fields = scientificInputFields.mesh;
      rejectUnknown(p, [...Object.keys(fields), "cellSizes", "boundaryDetails", "generators", "maxCells", "allowLarge", "generatorTimeoutMinutes"]);
      const cellSizes = stringParameter("mesh", "cellSizes", p.cellSizes);
      const boundaryDetails = stringParameter("mesh", "boundaryDetails", p.boundaryDetails);
      assertParameterCombination("mesh", { cellSizes, boundaryDetails });
      if (p.allowLarge !== undefined && typeof p.allowLarge !== "boolean")
        throw new BadRequestException("Недопустимый флаг большого расчёта");
      return { kind: "mesh", input: {
        ...references(p, fields), cellSizes, boundaryDetails,
        generators: stringParameter(data.kind as CalculationKind, "generators", p.generators),
        maxCells: numericParameter(data.kind as CalculationKind, "maxCells", p.maxCells),
        allowLarge: p.allowLarge ?? false,
        generatorTimeoutMinutes: numericParameter(data.kind as CalculationKind, "generatorTimeoutMinutes", p.generatorTimeoutMinutes),
      } };
    }
    case "seabed_build": {
      const fields = scientificInputFields.seabed_build;
      rejectUnknown(p, [...Object.keys(fields), "boundaryDetail", "maxSourceDistance", "coastTransition", "recoverWgs84", "maxNodes", "maxCells", "maxOutputMiB", "allowLarge"]);
      for (const key of ["recoverWgs84", "allowLarge"])
        if (p[key] !== undefined && typeof p[key] !== "boolean")
          throw new BadRequestException(`Недопустимый флаг «${key}»`);
      return { kind: "seabed_build", input: {
        ...references(p, fields),
        boundaryDetail: numericParameter(data.kind as CalculationKind, "boundaryDetail", p.boundaryDetail),
        maxSourceDistance: numericParameter(data.kind as CalculationKind, "maxSourceDistance", p.maxSourceDistance),
        coastTransition: numericParameter(data.kind as CalculationKind, "coastTransition", p.coastTransition),
        recoverWgs84: p.recoverWgs84 !== false,
        maxNodes: numericParameter(data.kind as CalculationKind, "maxNodes", p.maxNodes),
        maxCells: numericParameter(data.kind as CalculationKind, "maxCells", p.maxCells),
        maxOutputMiB: numericParameter(data.kind as CalculationKind, "maxOutputMiB", p.maxOutputMiB),
        allowLarge: p.allowLarge === true,
      } };
    }
    case "seabed_render": {
      const fields = scientificInputFields.seabed_render;
      rejectUnknown(p, [...Object.keys(fields), "isobaths", "verticalExaggeration", "controlPoints", "reportType"]);
      const isobaths = stringParameter(data.kind as CalculationKind, "isobaths", p.isobaths);
      if (p.controlPoints !== undefined && typeof p.controlPoints !== "boolean")
        throw new BadRequestException("Недопустимый параметр контрольных точек");
      return { kind: "seabed_render", input: {
        ...references(p, fields), ...reportOptions("seabed_render", p.reportType), isobaths,
        verticalExaggeration: numericParameter(data.kind as CalculationKind, "verticalExaggeration", p.verticalExaggeration),
        controlPoints: p.controlPoints ?? true,
      } };
    }
    case "seabed_adapt": {
      const fields = scientificInputFields.seabed_adapt;
      const options = Object.entries(adaptiveParameterDefinitions);
      rejectUnknown(p, [...Object.keys(fields), ...options.map(([key]) => key), "reportType"]);
      const result: Record<string, string | number> = { ...references(p, fields), ...reportOptions("seabed_adapt", p.reportType) };
      for (const [key] of options)
        result[key] = numericParameter("seabed_adapt", key, p[key]);
      assertParameterCombination("seabed_adapt", result);
      return { kind: "seabed_adapt", input: result };
    }
    case "seabed_generate_adaptive": {
      const fields = scientificInputFields.seabed_generate_adaptive;
      rejectUnknown(p, [...Object.keys(fields), "boundaryDetail", "generator", "maxCells", "allowLarge", "generatorTimeoutMinutes"]);
      const generator = stringParameter("seabed_generate_adaptive", "generator", p.generator);
      if (p.allowLarge !== undefined && typeof p.allowLarge !== "boolean")
        throw new BadRequestException("Недопустимый флаг большого расчёта");
      return { kind: "seabed_generate_adaptive", input: {
        ...references(p, fields), generator: String(generator),
        boundaryDetail: numericParameter(data.kind as CalculationKind, "boundaryDetail", p.boundaryDetail),
        maxCells: numericParameter(data.kind as CalculationKind, "maxCells", p.maxCells),
        allowLarge: p.allowLarge === true,
        generatorTimeoutMinutes: numericParameter(data.kind as CalculationKind, "generatorTimeoutMinutes", p.generatorTimeoutMinutes),
      } };
    }
    case "seabed_validate": {
      const fields = scientificInputFields.seabed_validate;
      rejectUnknown(p, [...Object.keys(fields), "isobaths", "worstCells", "maxNearestDistance"]);
      const isobaths = stringParameter(data.kind as CalculationKind, "isobaths", p.isobaths);
      return { kind: "seabed_validate", input: {
        ...references(p, fields), isobaths,
        worstCells: numericParameter(data.kind as CalculationKind, "worstCells", p.worstCells),
        maxNearestDistance: numericParameter(data.kind as CalculationKind, "maxNearestDistance", p.maxNearestDistance),
      } };
    }
    case "seabed_compare_adaptive": {
      const fields = scientificInputFields.seabed_compare_adaptive;
      rejectUnknown(p, [...Object.keys(fields), "boundaryDetail", "generators", "levels", "levelMin", "levelMax", "maxCells", "allowLarge", "generatorTimeoutMinutes", "detailPreset", "generateExpertSet", "expertLevels", "expertSeed", "generateFigureFive", "figureFiveLevel", "figureFiveGenerator"]);
      const generators = stringParameter(data.kind as CalculationKind, "generators", p.generators);
      const detailPreset = stringParameter("seabed_compare_adaptive", "detailPreset", p.detailPreset);
      if (p.allowLarge !== undefined && typeof p.allowLarge !== "boolean")
        throw new BadRequestException("Недопустимый флаг большого расчёта");
      if (p.levels !== undefined && (p.levelMin !== undefined || p.levelMax !== undefined))
        throw new BadRequestException("Укажите либо список уровней, либо один диапазон");
      const legacyLevels = p.levelMin !== undefined || p.levelMax !== undefined
        ? `detailed:${numberIn(p.levelMin === undefined ? 125 : p.levelMin, "Минимальный размер", 10, 10000)}:${numberIn(p.levelMax === undefined ? 250 : p.levelMax, "Максимальный размер", 10, 10000)}`
        : undefined;
      const levels = stringParameter("seabed_compare_adaptive", "levels", p.levels === undefined ? legacyLevels : p.levels);
      const expert = expertOptions(p, levels, generators);
      const figureFive = figureFiveOptions(p, levels, generators, expert);
      return { kind: "seabed_compare_adaptive", input: {
        ...references(p, fields),
        boundaryDetail: numericParameter(data.kind as CalculationKind, "boundaryDetail", p.boundaryDetail),
        generators, levels, detailPreset, ...expert, ...figureFive,
        maxCells: numericParameter(data.kind as CalculationKind, "maxCells", p.maxCells),
        allowLarge: p.allowLarge ?? false,
        generatorTimeoutMinutes: numericParameter(data.kind as CalculationKind, "generatorTimeoutMinutes", p.generatorTimeoutMinutes),
      } };
    }
    case "seabed_assess_ml": {
      const fields = scientificInputFields.seabed_assess_ml;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(aiNecessityDefaults)]);
      return { kind: "seabed_assess_ml", input: {
        ...references(p, fields),
        minExpertsPerCard: numericParameter(data.kind as CalculationKind, "minExpertsPerCard", p.minExpertsPerCard),
        minTraining: numericParameter(data.kind as CalculationKind, "minTraining", p.minTraining),
        minEvaluation: numericParameter(data.kind as CalculationKind, "minEvaluation", p.minEvaluation),
        ridgeLambda: numericParameter(data.kind as CalculationKind, "ridgeLambda", p.ridgeLambda),
        minRmseImprovement: numericParameter(data.kind as CalculationKind, "minRmseImprovement", p.minRmseImprovement),
      } };
    }
    case "seabed_check_full": {
      const fields = scientificInputFields.seabed_check_full;
      rejectUnknown(p, [...Object.keys(fields), "generator", "targetEdge", "boundaryDetail", "maxSourceDistance", "coastTransition", "isobaths", "verticalExaggeration", "controlPoints"]);
      const generator = stringParameter("seabed_check_full", "generator", p.generator);
      if (p.controlPoints !== undefined && typeof p.controlPoints !== "boolean")
        throw new BadRequestException("Недопустимый параметр контрольных точек");
      return { kind: "seabed_check_full", input: {
        ...references(p, fields), generator,
        targetEdge: numericParameter(data.kind as CalculationKind, "targetEdge", p.targetEdge),
        boundaryDetail: numericParameter(data.kind as CalculationKind, "boundaryDetail", p.boundaryDetail),
        maxSourceDistance: numericParameter(data.kind as CalculationKind, "maxSourceDistance", p.maxSourceDistance),
        coastTransition: numericParameter(data.kind as CalculationKind, "coastTransition", p.coastTransition),
        isobaths: stringParameter(data.kind as CalculationKind, "isobaths", p.isobaths),
        verticalExaggeration: numericParameter(data.kind as CalculationKind, "verticalExaggeration", p.verticalExaggeration),
        controlPoints: p.controlPoints ?? true,
      } };
    }
  }
  throw new BadRequestException("Неизвестный тип расчёта");
}

export function commandArguments(
  job: unknown,
  output: string,
  datasetPath?: string,
  files: Record<string, string> = {},
  sources: Record<string, string> = {},
): string[] {
  const validated = validateCalculation(job);
  const input = validated.input ?? {};
  const required = (key: string) => {
    if (!files[key]) throw new Error(`Не подготовлен научный файл ${key}`);
    return files[key];
  };
  const requiredSource = (key: string) => {
    if (!sources[key]) throw new Error(`Не указан источник научного файла ${key}`);
    return sources[key];
  };
  const cercProfileArguments = () => [
    ...(input.sedimentSourcesInputId ? ["--sediment-sources", required("sedimentSourcesInputId")] : []),
    ...(input.structuresInputId ? ["--structures", required("structuresInputId")] : []),
  ];
  switch (validated.kind) {
    case "coastline_region":
      return ["region", "--input", input.coastlineInputId ? required("coastlineInputId") : bundledBlackSeaPath,
        "--west", String(input.west), "--east", String(input.east), "--south", String(input.south), "--north", String(input.north), "--output", output];
    case "dimension":
      return ["dimension", "--input", bundledBlackSeaPath, "--output", output];
    case "dimension_dataset":
      if (!datasetPath) throw new Error("Для пользовательского расчёта нужен серверный путь набора");
      return ["dimension", "--input", datasetPath, "--output", output];
    case "dataset_validation":
      if (!datasetPath) throw new Error("Для проверки нужен серверный путь набора");
      return ["coastline-check", "--input", datasetPath, "--output", output];
    case "dimension_file":
      return ["dimension", "--input", required("coastlineInputId"), "--output", output];
    case "source_file":
      return ["source", "--input", required("coastlineInputId"), "--output", output];
    case "coastline_validation":
      return ["coastline-check", "--input", required("coastlineInputId"), "--output", output];
    case "map":
      return ["map", "black-sea", "--input", bundledBlackSeaPath, "--output", output];
    case "map_file":
      return ["map", "black-sea", "--input", required("coastlineInputId"), "--output", output];
    case "erosion_file":
      return ["erosion", "--input", required("coastlineInputId"),
        "--wave-input", required("waveInputId"), "--wave-source", requiredSource("waveInputId"),
        "--bathymetry", required("bathymetryInputId"), ...cercArguments(input), ...cercProfileArguments(),
        ...(input.outputCsv ? ["--output-csv", "erosion-metrics.csv", "--csv-format", String(input.csvFormat)] : []),
        ...(input.outputGif ? ["--output-gif", "erosion-animation.gif", "--gif-fps", String(input.gifFps), "--gif-skip", String(input.gifSkip)] : []),
        "--output", output];
    case "all_file":
      return ["all", "--input", required("coastlineInputId"),
        "--wave-input", required("waveInputId"), "--wave-source", requiredSource("waveInputId"),
        "--bathymetry", required("bathymetryInputId"), ...cercArguments(input), ...cercProfileArguments(),
        ...allExportArguments(input),
        "--output", output];
    case "calibrate_cerc":
      return ["calibrate-cerc", "--input", required("coastlineInputId"),
        "--wave-input", required("waveInputId"), "--wave-source", requiredSource("waveInputId"),
        "--bathymetry", required("bathymetryInputId"),
        "--bathymetry-resolution", String(input.bathymetryResolution),
        "--observations", required("observationsInputId"),
        "--cerc-coefficients", String(input.cercCoefficients),
        "--max-observation-distance", String(input.maxObservationDistance),
        "--min-wave-hours", String(input.minWaveHours),
        "--breaking-index", String(input.breakingIndex),
        "--berm-height", String(input.bermHeight),
        "--closure-depth", String(input.closureDepth),
        "--porosity", String(input.porosity),
        "--offshore-sample-distance", String(input.offshoreSampleDistance),
        "--max-bathymetry-gap", String(input.maxBathymetryGap),
        "--left-boundary-transport", String(input.leftBoundaryTransport),
        "--right-boundary-transport", String(input.rightBoundaryTransport),
        ...cercProfileArguments(),
        "--output", output];
    case "shoreline_data_audit":
      return ["shoreline-data-audit", "--observations", required("observationsInputId"),
        ...(input.waveInputId ? ["--wave-input", required("waveInputId"), "--wave-source", requiredSource("waveInputId")] : []),
        ...(input.validationStart ? ["--validation-start", String(input.validationStart)] : []),
        "--output", output];
    case "mesh":
      return ["mesh", "--input", required("coastlineInputId"),
        "--cell-sizes", String(input.cellSizes), "--boundary-details", String(input.boundaryDetails),
        "--generators", String(input.generators), "--max-cells", String(input.maxCells),
        ...(input.allowLarge ? ["--allow-large"] : []),
        "--generator-timeout", `${input.generatorTimeoutMinutes}m`, "--output", output];
    case "seabed_build":
      return ["seabed", "build", "--mesh", required("flatMeshInputId"),
        "--bathymetry", required("bathymetryInputId"),
        "--bathymetry-metadata", required("bathymetryMetadataInputId"),
        "--coastline", required("coastlineInputId"),
        "--boundary-detail", String(input.boundaryDetail),
        "--max-source-distance", String(input.maxSourceDistance),
        "--coast-transition", String(input.coastTransition),
        `--recover-wgs84=${String(input.recoverWgs84)}`,
        "--max-nodes", String(input.maxNodes), "--max-cells", String(input.maxCells),
        "--max-output-mib", String(input.maxOutputMiB),
        ...(input.allowLarge ? ["--allow-large"] : []),
        "--output", `${output}/seabed`];
    case "seabed_render":
      return ["seabed", "render", "--input", required("modelInputId"),
        "--metadata", required("exportMetadataInputId"),
        "--source-metadata", required("sourceMetadataInputId"),
        "--isobaths", String(input.isobaths),
        "--vertical-exaggeration", String(input.verticalExaggeration),
        `--control-points=${String(input.controlPoints)}`, "--output", output];
    case "seabed_adapt": {
      const args = ["seabed", "adapt", "--input", required("modelInputId"),
        "--source-metadata", required("sourceMetadataInputId")];
      for (const [key, flag] of Object.entries({
        minSize: "min-size", coastSize: "coast-size", shelfSize: "shelf-size", deepSize: "deep-size",
        coastInfluence: "coast-influence", curvatureReference: "curvature-reference",
        slopeReference: "slope-reference", flatDeepSlope: "flat-deep-slope",
        maxNeighbourRatio: "max-neighbour-ratio", maxSizeGradient: "max-size-gradient",
      }))
        if (input[key] !== undefined) args.push(`--${flag}`, String(input[key]));
      return [...args, "--output", output];
    }
    case "seabed_generate_adaptive":
      return ["seabed", "generate-adaptive", "--input", required("modelInputId"),
        "--metadata", required("exportMetadataInputId"),
        "--field", required("fieldCsvInputId"),
        "--field-report", required("fieldReportInputId"),
        "--coastline", required("coastlineInputId"),
        "--boundary-detail", String(input.boundaryDetail),
        "--generator", String(input.generator),
        "--max-cells", String(input.maxCells),
        ...(input.allowLarge ? ["--allow-large"] : []),
        "--generator-timeout", `${input.generatorTimeoutMinutes}m`,
        "--output", output];
    case "seabed_validate":
      return ["seabed", "validate", "--input", required("modelInputId"),
        "--metadata", required("exportMetadataInputId"),
        "--reference", required("referenceModelInputId"),
        "--reference-metadata", required("referenceMetadataInputId"),
        "--reference-passport", required("referencePassportInputId"),
        "--size-field", required("fieldCsvInputId"),
        "--size-field-report", required("fieldReportInputId"),
        "--isobaths", String(input.isobaths),
        "--worst-cells", String(input.worstCells),
        "--max-nearest-distance", String(input.maxNearestDistance),
        "--output", output];
    case "seabed_compare_adaptive":
      return ["seabed", "compare-adaptive", "--input", required("modelInputId"),
        "--metadata", required("exportMetadataInputId"),
        "--field", required("fieldCsvInputId"),
        "--field-report", required("fieldReportInputId"),
        "--coastline", required("coastlineInputId"),
        "--boundary-detail", String(input.boundaryDetail),
        "--generators", String(input.generators),
        "--levels", String(input.levels),
        "--max-cells", String(input.maxCells),
        ...(input.allowLarge ? ["--allow-large"] : []),
        "--generator-timeout", `${input.generatorTimeoutMinutes}m`,
        "--detail-preset", String(input.detailPreset),
        ...(input.generateExpertSet ? ["--expert-set", "--expert-levels", String(input.expertLevels), "--expert-seed", String(input.expertSeed)] : []),
        ...(input.generateFigureFive ? ["--figure-five", "--figure-five-level", String(input.figureFiveLevel), "--figure-five-generator", String(input.figureFiveGenerator)] : []),
        "--output", output];
    case "seabed_assess_ml":
      return ["seabed", "assess-ml",
        "--ratings", required("ratingsInputId"),
        "--organizer-key", required("organizerKeyInputId"),
        "--comparison", required("comparisonReportInputId"),
        "--input", required("modelInputId"),
        "--metadata", required("exportMetadataInputId"),
        "--coastline", required("coastlineInputId"),
        "--min-experts-per-card", String(input.minExpertsPerCard),
        "--min-training", String(input.minTraining),
        "--min-evaluation", String(input.minEvaluation),
        "--ridge-lambda", String(input.ridgeLambda),
        "--min-rmse-improvement", String(input.minRmseImprovement),
        "--output", output];
    case "seabed_check_full":
      return ["seabed", "check-full", "--mesh", required("flatMeshInputId"),
        "--mesh-report", required("meshReportInputId"),
        "--coastline", required("coastlineInputId"),
        "--bathymetry", required("bathymetryInputId"),
        "--bathymetry-metadata", required("bathymetryMetadataInputId"),
        "--generator", String(input.generator),
        "--target-edge", String(input.targetEdge),
        "--boundary-detail", String(input.boundaryDetail),
        "--max-source-distance", String(input.maxSourceDistance),
        "--coast-transition", String(input.coastTransition),
        "--isobaths", String(input.isobaths),
        "--vertical-exaggeration", String(input.verticalExaggeration),
        `--control-points=${String(input.controlPoints)}`,
        "--max-mesh-mib", "256", "--output", output];
  }
}
