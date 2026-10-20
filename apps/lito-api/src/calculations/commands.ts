import { BadRequestException } from "@nestjs/common";
import { bundledBlackSeaPath } from "./input-provenance.js";
import { aiNecessityDefaults, allDemoDefaults, allFileDefaults, cercCalibrationDefaults, erosionDemoDefaults, erosionFileDefaults, expertSetDefaults, optionalScientificInputRequirements, scientificInputRequirements } from "@litora/contracts";
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
  { kind: "source_file", title: "Проверить источник береговой линии", description: "Проверка загруженного контура и сохранение его снимка с манифестом." },
  { kind: "dimension", title: "Фрактальная размерность", description: "Box-counting полного закреплённого контура MarineRegions: карта, регрессия и метрики." },
  { kind: "dimension_dataset", title: "Размерность своей береговой линии", description: "Box-counting небольшого GeoJSON LineString." },
  { kind: "dimension_file", title: "Размерность полного контура", description: "Box-counting загруженного GeoJSON, включая полный контур Чёрного моря." },
  { kind: "map", title: "Карта Чёрного моря", description: "Полный закреплённый контур MarineRegions: обзорная SVG и GeoJSON." },
  { kind: "map_file", title: "Карта своего контура", description: "Обзорная SVG и GeoJSON по загруженному контуру Чёрного моря." },
  { kind: "erosion", title: "Эрозия: демонстрационный сценарий Сочи", description: "CERC на закреплённых данных; демонстрация, не прогноз." },
  { kind: "erosion_file", title: "Эрозия по своим данным", description: "CERC по загруженным контуру, волнам и батиметрии с проверяемым паспортом; не калиброванный прогноз." },
  { kind: "all_demo", title: "Полный демонстрационный конвейер Сочи", description: "Проверка контура, размерность, CERC и баланс наносов; SVG, JSON, опционально CSV и GIF." },
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
  return kind === "source_file" || kind === "dimension_file" || kind === "map_file" ||
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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function numberIn(value: unknown, label: string, minimum: number, maximum: number, integer = false) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < minimum || value > maximum || (integer && !Number.isInteger(value))
  ) throw new BadRequestException(`Недопустимое значение «${label}»`);
  return value;
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

function positiveNumberList(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9]{1,5}(,[0-9]{1,5}){0,3}$/.test(value))
    throw new BadRequestException(`Недопустимый список «${label}»`);
  for (const item of value.split(","))
    numberIn(Number(item), label, 10, 10000);
  return value;
}

function generatorList(value: unknown) {
  if (typeof value !== "string" ||
      !["delaunay", "frontal-quad", "parallelograms", "delaunay,frontal-quad", "delaunay,frontal-quad,parallelograms"].includes(value))
    throw new BadRequestException("Недопустимый набор генераторов Gmsh");
  return value;
}

function comparisonLevels(value: unknown) {
  if (typeof value !== "string") throw new BadRequestException("Уровни должны быть строкой");
  const levels = value.split(",");
  if (levels.length < 1 || levels.length > 4)
    throw new BadRequestException("Допустимо от одного до четырёх уровней");
  const ids = new Set<string>();
  for (const level of levels) {
    const parts = /^([a-z][a-z0-9_-]{0,31}):([0-9]{1,5}):([0-9]{1,5})$/.exec(level);
    if (!parts || ids.has(parts[1]) ||
        numberIn(Number(parts[2]), "Минимум уровня", 10, 10000) >=
          numberIn(Number(parts[3]), "Максимум уровня", 10, 10000))
      throw new BadRequestException("Уровни: уникальные id:min:max, 10–10000 м и min < max");
    ids.add(parts[1]);
  }
  return value;
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

function isobathList(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]{1,5}(\.[0-9]{1,3})?(,[0-9]{1,5}(\.[0-9]{1,3})?){0,15}$/.test(value) ||
      value.split(",").some((item) => Number(item) <= 0 || Number(item) > 10000))
    throw new BadRequestException("Изобаты: до 16 глубин больше 0 и не более 10000 м через запятую");
  return value;
}

function validateCercOptions(
  input: Record<string, unknown>,
  defaults: CercOptionsDto,
  maxSteps: number,
  maxGifSkip: number,
): CercOptionsDto {
  if (input.outputCsv !== undefined && typeof input.outputCsv !== "boolean")
    throw new BadRequestException("Недопустимый флаг экспорта CSV");
  if (input.csvFormat !== undefined && input.csvFormat !== "long" && input.csvFormat !== "wide")
    throw new BadRequestException("Формат CSV должен быть long или wide");
  if (input.outputGif !== undefined && typeof input.outputGif !== "boolean")
    throw new BadRequestException("Недопустимый флаг экспорта GIF");
  const ownFullSeries = defaults.svgMaxFrames !== undefined;
  const steps = numberIn(input.steps ?? defaults.steps, "Шаги", ownFullSeries ? 0 : 1, maxSteps, true);
  const svgMaxFrames = ownFullSeries
    ? numberIn(input.svgMaxFrames ?? defaults.svgMaxFrames, "Число SVG", 0, 128, true)
    : undefined;
  if (steps === 0 && (svgMaxFrames === undefined || svgMaxFrames < 2))
    throw new BadRequestException("Для полного волнового ряда укажите от 2 до 128 SVG");
  const outputGif = input.outputGif ?? defaults.outputGif;
  const outputCsv = input.outputCsv ?? defaults.outputCsv;
  const csvFormat = input.csvFormat ?? defaults.csvFormat;
  if (steps === 0 && outputGif)
    throw new BadRequestException("GIF для полного волнового ряда недоступен из-за расхода памяти");
  if (steps > 48 && outputGif)
    throw new BadRequestException("Для ряда длиннее 48 часов используйте интерактивный реплей вместо GIF");
  if (steps === 0 && outputCsv && csvFormat === "wide")
    throw new BadRequestException("Для полного волнового ряда используйте длинный CSV");
  return {
    steps,
    ...(svgMaxFrames !== undefined ? { svgMaxFrames } : {}),
    breakingIndex: numberIn(input.breakingIndex ?? defaults.breakingIndex, "Индекс разрушения", 0.55, 1.2),
    bermHeight: numberIn(input.bermHeight ?? defaults.bermHeight, "Высота бермы", 0.001, 100),
    closureDepth: numberIn(input.closureDepth ?? defaults.closureDepth, "Глубина замыкания", 0.001, 1000),
    porosity: numberIn(input.porosity ?? defaults.porosity, "Пористость", 0.000001, 0.699999),
    cercCoefficient: numberIn(input.cercCoefficient ?? defaults.cercCoefficient, "Коэффициент CERC", 0.000001, 1),
    offshoreSampleDistance: numberIn(input.offshoreSampleDistance ?? defaults.offshoreSampleDistance, "Отбор глубины", 1, 100000),
    maxShorelineChange: numberIn(input.maxShorelineChange ?? defaults.maxShorelineChange, "Предел смещения", 0.001, 1000),
    maxBathymetryGap: numberIn(input.maxBathymetryGap ?? defaults.maxBathymetryGap, "Радиус батиметрии", 1, 100000),
    leftBoundaryTransport: numberIn(input.leftBoundaryTransport ?? defaults.leftBoundaryTransport, "Левый граничный поток", -1_000_000, 1_000_000),
    rightBoundaryTransport: numberIn(input.rightBoundaryTransport ?? defaults.rightBoundaryTransport, "Правый граничный поток", -1_000_000, 1_000_000),
    outputCsv,
    csvFormat,
    outputGif,
    gifFps: numberIn(input.gifFps ?? defaults.gifFps, "Частота GIF", 1, 30, true),
    gifSkip: numberIn(input.gifSkip ?? defaults.gifSkip, "Пропуск кадров", 1, maxGifSkip, true),
  };
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
  maxSteps: number,
): AllOptionsDto {
  if (input.noModelSimplify !== undefined && typeof input.noModelSimplify !== "boolean")
    throw new BadRequestException("Недопустимый флаг упрощения модели");
  const modelMaxPoints = numberIn(input.modelMaxPoints ?? defaults.modelMaxPoints, "Число точек модели", 0, 10000, true);
  if (modelMaxPoints === 1) throw new BadRequestException("Модель должна содержать не менее двух точек");
  if (modelMaxPoints > 0 && input.noModelSimplify === true)
    throw new BadRequestException("Отключение упрощения несовместимо с заданным числом точек");
  return {
    ...validateCercOptions(input, defaults, maxSteps, maxSteps),
    modelMaxPoints,
    noModelSimplify: input.noModelSimplify ?? defaults.noModelSimplify,
  };
}

function allExportArguments(input: Record<string, string | number | boolean | undefined>) {
  return [
    ...(input.outputCsv ? ["--output-csv", "all-metrics.csv", "--csv-format", String(input.csvFormat)] : []),
    ...(input.outputGif ? ["--output-gif", "all-animation.gif", "--gif-fps", String(input.gifFps), "--gif-skip", String(input.gifSkip)] : []),
    ...(input.modelMaxPoints ? ["--model-max-points", String(input.modelMaxPoints)] : []),
    ...(input.noModelSimplify ? ["--no-model-simplify"] : []),
  ];
}

function calibrationCoefficients(value: unknown) {
  if (typeof value !== "string" || value.length > 96)
    throw new BadRequestException("Коэффициенты CERC задаются числами через запятую");
  const items = value.split(",").map((item) => item.trim());
  if (items.length < 1 || items.length > 8 || items.some((item) =>
    !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(item) ||
    !Number.isFinite(Number(item)) || Number(item) <= 0 || Number(item) > 1
  )) throw new BadRequestException("Коэффициенты CERC должны содержать от одного до восьми чисел в диапазоне (0;1]");
  return items.join(",");
}

function validateCalibrationOptions(input: Record<string, unknown>): CercCalibrationOptionsDto {
  const defaults = cercCalibrationDefaults;
  return {
    bathymetryResolution: numberIn(input.bathymetryResolution, "Шаг батиметрии", 0.000000001, 1),
    cercCoefficients: calibrationCoefficients(input.cercCoefficients ?? defaults.cercCoefficients),
    maxObservationDistance: numberIn(input.maxObservationDistance ?? defaults.maxObservationDistance, "Удаление наблюдения", 1, 100000),
    minWaveHours: numberIn(input.minWaveHours ?? defaults.minWaveHours, "Покрытие волнового ряда", 8766, 100000),
    breakingIndex: numberIn(input.breakingIndex ?? defaults.breakingIndex, "Индекс разрушения", 0.55, 1.2),
    bermHeight: numberIn(input.bermHeight ?? defaults.bermHeight, "Высота бермы", 0.001, 100),
    closureDepth: numberIn(input.closureDepth ?? defaults.closureDepth, "Глубина замыкания", 0.001, 1000),
    porosity: numberIn(input.porosity ?? defaults.porosity, "Пористость", 0.000001, 0.699999),
    offshoreSampleDistance: numberIn(input.offshoreSampleDistance ?? defaults.offshoreSampleDistance, "Отбор глубины", 1, 100000),
    maxBathymetryGap: numberIn(input.maxBathymetryGap ?? defaults.maxBathymetryGap, "Радиус батиметрии", 1, 100000),
    leftBoundaryTransport: numberIn(input.leftBoundaryTransport ?? defaults.leftBoundaryTransport, "Левый граничный поток", -1_000_000, 1_000_000),
    rightBoundaryTransport: numberIn(input.rightBoundaryTransport ?? defaults.rightBoundaryTransport, "Правый граничный поток", -1_000_000, 1_000_000),
  };
}

export function validateCalculation(body: unknown): CreateCalculationDto {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Ожидается объект расчёта");
  const data = body as Record<string, unknown>;
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
      const west = numberIn(p.west, "Западная долгота", 27, 42.5);
      const east = numberIn(p.east, "Восточная долгота", 27, 42.5);
      const south = numberIn(p.south, "Южная широта", 40.5, 47.5);
      const north = numberIn(p.north, "Северная широта", 40.5, 47.5);
      if (west >= east || south >= north) throw new BadRequestException("Запад должен быть меньше востока, а юг — меньше севера");
      return { kind: "coastline_region", input: { west, east, south, north, ...optionalReferences(p, "coastline_region") } };
    }
    case "dimension":
    case "map":
      rejectUnknown(p, []);
      return { kind: data.kind, input: {} };
    case "dimension_dataset":
      rejectUnknown(p, ["datasetId"]);
      return { kind: "dimension_dataset", input: references(p, { datasetId: "coastline_geojson" }) };
    case "dimension_file":
      rejectUnknown(p, ["coastlineInputId"]);
      return { kind: "dimension_file", input: references(p, scientificInputFields.dimension_file) };
    case "source_file":
    case "map_file":
      rejectUnknown(p, ["coastlineInputId"]);
      return { kind: data.kind, input: references(p, scientificInputFields[data.kind]) };
    case "erosion": {
      rejectUnknown(p, Object.keys(erosionDemoDefaults));
      return { kind: "erosion", input: { ...validateCercOptions(p, erosionDemoDefaults, 168, 48) } };
    }
    case "erosion_file": {
      const fields = scientificInputFields.erosion_file;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(optionalScientificInputRequirements.erosion_file), ...Object.keys(erosionFileDefaults)]);
      return { kind: "erosion_file", input: {
        ...references(p, fields),
        ...optionalReferences(p, "erosion_file"),
        ...validateCercOptions(p, erosionFileDefaults, 48, 48),
      } };
    }
    case "all_demo": {
      rejectUnknown(p, Object.keys(allDemoDefaults));
      return { kind: "all_demo", input: { ...validateAllOptions(p, allDemoDefaults, 24) } };
    }
    case "all_file": {
      const fields = scientificInputFields.all_file;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(optionalScientificInputRequirements.all_file), ...Object.keys(allFileDefaults)]);
      const options = validateAllOptions(p, allFileDefaults, 48);
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
      const cellSizes = positiveNumberList(p.cellSizes ?? "1000", "Длины рёбер");
      const boundaryDetails = positiveNumberList(p.boundaryDetails ?? "1000", "Детализация берега");
      if (boundaryDetails.split(",").length !== 1 && boundaryDetails.split(",").length !== cellSizes.split(",").length)
        throw new BadRequestException("Количество детализаций должно быть равно числу размеров или одному");
      if (p.allowLarge !== undefined && typeof p.allowLarge !== "boolean")
        throw new BadRequestException("Недопустимый флаг большого расчёта");
      return { kind: "mesh", input: {
        ...references(p, fields), cellSizes, boundaryDetails,
        generators: generatorList(p.generators ?? "frontal-quad"),
        maxCells: numberIn(p.maxCells ?? 5_000_000, "Лимит ячеек", 1000, 25_000_000, true),
        allowLarge: p.allowLarge ?? false,
        generatorTimeoutMinutes: numberIn(p.generatorTimeoutMinutes ?? 20, "Время Gmsh", 1, 120, true),
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
        boundaryDetail: numberIn(p.boundaryDetail ?? 1000, "Детализация берега", 10, 10000),
        maxSourceDistance: numberIn(p.maxSourceDistance ?? 50000, "Поиск батиметрии", 100, 100000),
        coastTransition: numberIn(p.coastTransition ?? 0, "Переход у берега", 0, 100000),
        recoverWgs84: p.recoverWgs84 !== false,
        maxNodes: numberIn(p.maxNodes ?? 5_000_000, "Лимит узлов", 1000, 25_000_000, true),
        maxCells: numberIn(p.maxCells ?? 5_000_000, "Лимит ячеек", 1000, 25_000_000, true),
        maxOutputMiB: numberIn(p.maxOutputMiB ?? 2048, "Лимит результата", 1, 8192, true),
        allowLarge: p.allowLarge === true,
      } };
    }
    case "seabed_render": {
      const fields = scientificInputFields.seabed_render;
      rejectUnknown(p, [...Object.keys(fields), "isobaths", "verticalExaggeration", "controlPoints"]);
      const isobaths = isobathList(p.isobaths ?? "20,50,100,200,500,1000,1500,2000");
      if (p.controlPoints !== undefined && typeof p.controlPoints !== "boolean")
        throw new BadRequestException("Недопустимый параметр контрольных точек");
      return { kind: "seabed_render", input: {
        ...references(p, fields), isobaths,
        verticalExaggeration: numberIn(p.verticalExaggeration ?? 40, "Вертикальное преувеличение", 1, 200),
        controlPoints: p.controlPoints ?? true,
      } };
    }
    case "seabed_adapt": {
      const fields = scientificInputFields.seabed_adapt;
      const options = [
        ["minSize", 200, 1, 100000], ["coastSize", 300, 1, 100000],
        ["shelfSize", 500, 1, 100000], ["deepSize", 1000, 1, 100000],
        ["coastInfluence", 25000, 1, 1000000],
        ["curvatureReference", 30, 0.001, 180],
        ["slopeReference", 10, 0.001, 90],
        ["flatDeepSlope", 1, 0.001, 90],
        ["maxNeighbourRatio", 1.25, 1.000001, 100],
        ["maxSizeGradient", 0.15, 0.000001, 100],
      ] as const;
      rejectUnknown(p, [...Object.keys(fields), ...options.map(([key]) => key)]);
      const result: Record<string, string | number> = references(p, fields);
      for (const [key, fallback, minimum, maximum] of options)
        result[key] = numberIn(p[key] ?? fallback, key, minimum, maximum);
      if (!(Number(result.minSize) <= Number(result.coastSize) &&
            Number(result.coastSize) <= Number(result.shelfSize) &&
            Number(result.shelfSize) <= Number(result.deepSize)))
        throw new BadRequestException("Размеры должны удовлетворять min ≤ coast ≤ shelf ≤ deep");
      return { kind: "seabed_adapt", input: result };
    }
    case "seabed_generate_adaptive": {
      const fields = scientificInputFields.seabed_generate_adaptive;
      rejectUnknown(p, [...Object.keys(fields), "boundaryDetail", "generator", "maxCells", "allowLarge", "generatorTimeoutMinutes"]);
      const generator = p.generator ?? "delaunay";
      if (!["delaunay", "frontal-quad", "parallelograms"].includes(String(generator)))
        throw new BadRequestException("Недопустимый генератор Gmsh");
      if (p.allowLarge !== undefined && typeof p.allowLarge !== "boolean")
        throw new BadRequestException("Недопустимый флаг большого расчёта");
      return { kind: "seabed_generate_adaptive", input: {
        ...references(p, fields), generator: String(generator),
        boundaryDetail: numberIn(p.boundaryDetail ?? 200, "Детализация берега", 10, 10000),
        maxCells: numberIn(p.maxCells ?? 5_000_000, "Лимит ячеек", 1000, 25_000_000, true),
        allowLarge: p.allowLarge === true,
        generatorTimeoutMinutes: numberIn(p.generatorTimeoutMinutes ?? 20, "Время Gmsh", 1, 120, true),
      } };
    }
    case "seabed_validate": {
      const fields = scientificInputFields.seabed_validate;
      rejectUnknown(p, [...Object.keys(fields), "isobaths", "worstCells", "maxNearestDistance"]);
      const isobaths = isobathList(p.isobaths ?? "20,200,1000,2000");
      return { kind: "seabed_validate", input: {
        ...references(p, fields), isobaths,
        worstCells: numberIn(p.worstCells ?? 20, "Число худших ячеек", 1, 1000, true),
        maxNearestDistance: numberIn(p.maxNearestDistance ?? 0, "Предел поиска глубины", 0, 100000),
      } };
    }
    case "seabed_compare_adaptive": {
      const fields = scientificInputFields.seabed_compare_adaptive;
      rejectUnknown(p, [...Object.keys(fields), "boundaryDetail", "generators", "levels", "levelMin", "levelMax", "maxCells", "allowLarge", "generatorTimeoutMinutes", "detailPreset", "generateExpertSet", "expertLevels", "expertSeed", "generateFigureFive", "figureFiveLevel", "figureFiveGenerator"]);
      const generators = generatorList(p.generators ?? "delaunay,frontal-quad");
      const detailPreset = p.detailPreset ?? "kizilirmak";
      if (detailPreset !== "none" && detailPreset !== "kizilirmak")
        throw new BadRequestException("Недопустимое окно детализации сетки");
      if (p.allowLarge !== undefined && typeof p.allowLarge !== "boolean")
        throw new BadRequestException("Недопустимый флаг большого расчёта");
      if (p.levels !== undefined && (p.levelMin !== undefined || p.levelMax !== undefined))
        throw new BadRequestException("Укажите либо список уровней, либо один диапазон");
      const levels = comparisonLevels(p.levels ??
        `detailed:${numberIn(p.levelMin ?? 125, "Минимальный размер", 10, 10000)}:${numberIn(p.levelMax ?? 250, "Максимальный размер", 10, 10000)}`);
      const expert = expertOptions(p, levels, generators);
      const figureFive = figureFiveOptions(p, levels, generators, expert);
      return { kind: "seabed_compare_adaptive", input: {
        ...references(p, fields),
        boundaryDetail: numberIn(p.boundaryDetail ?? 50, "Детализация берега", 10, 10000),
        generators, levels, detailPreset, ...expert, ...figureFive,
        maxCells: numberIn(p.maxCells ?? 25_000_000, "Лимит ячеек", 1000, 25_000_000, true),
        allowLarge: p.allowLarge ?? false,
        generatorTimeoutMinutes: numberIn(p.generatorTimeoutMinutes ?? 20, "Время Gmsh", 1, 120, true),
      } };
    }
    case "seabed_assess_ml": {
      const fields = scientificInputFields.seabed_assess_ml;
      rejectUnknown(p, [...Object.keys(fields), ...Object.keys(aiNecessityDefaults)]);
      return { kind: "seabed_assess_ml", input: {
        ...references(p, fields),
        minExpertsPerCard: numberIn(p.minExpertsPerCard ?? aiNecessityDefaults.minExpertsPerCard, "Эксперты на карточку", 2, 10, true),
        minTraining: numberIn(p.minTraining ?? aiNecessityDefaults.minTraining, "Карточки обучения", 2, 96, true),
        minEvaluation: numberIn(p.minEvaluation ?? aiNecessityDefaults.minEvaluation, "Карточки проверки", 2, 96, true),
        ridgeLambda: numberIn(p.ridgeLambda ?? aiNecessityDefaults.ridgeLambda, "Ridge-регуляризация", 0.000001, 1000),
        minRmseImprovement: numberIn(p.minRmseImprovement ?? aiNecessityDefaults.minRmseImprovement, "Улучшение RMSE", 0.001, 0.99),
      } };
    }
    case "seabed_check_full": {
      const fields = scientificInputFields.seabed_check_full;
      rejectUnknown(p, [...Object.keys(fields), "generator", "targetEdge", "boundaryDetail", "maxSourceDistance", "coastTransition", "isobaths", "verticalExaggeration", "controlPoints"]);
      const generator = p.generator ?? "frontal-quad";
      if (generator !== "delaunay" && generator !== "frontal-quad" && generator !== "parallelograms")
        throw new BadRequestException("Недопустимый генератор контрольной сетки");
      if (p.controlPoints !== undefined && typeof p.controlPoints !== "boolean")
        throw new BadRequestException("Недопустимый параметр контрольных точек");
      return { kind: "seabed_check_full", input: {
        ...references(p, fields), generator,
        targetEdge: numberIn(p.targetEdge ?? 1000, "Контрольное ребро", 10, 10000),
        boundaryDetail: numberIn(p.boundaryDetail ?? 1000, "Детализация берега", 10, 10000),
        maxSourceDistance: numberIn(p.maxSourceDistance ?? 50000, "Поиск батиметрии", 100, 100000),
        coastTransition: numberIn(p.coastTransition ?? 0, "Переход у берега", 0, 100000),
        isobaths: isobathList(p.isobaths ?? "20,50,100,200,500,1000,1500,2000"),
        verticalExaggeration: numberIn(p.verticalExaggeration ?? 40, "Вертикальное преувеличение", 1, 200),
        controlPoints: p.controlPoints ?? true,
      } };
    }
  }
  throw new BadRequestException("Неизвестный тип расчёта");
}

export function commandArguments(
  job: CreateCalculationDto,
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
    case "dimension_file":
      return ["dimension", "--input", required("coastlineInputId"), "--output", output];
    case "source_file":
      return ["source", "--input", required("coastlineInputId"), "--output", output];
    case "map":
      return ["map", "black-sea", "--input", bundledBlackSeaPath, "--output", output];
    case "map_file":
      return ["map", "black-sea", "--input", required("coastlineInputId"), "--output", output];
    case "erosion":
      return ["erosion", "--black-sea-sochi", "--offline", ...cercArguments(input),
        "--svg-max-frames", "12",
        ...(input.outputCsv ? ["--output-csv", "erosion-metrics.csv", "--csv-format", String(input.csvFormat)] : []),
        ...(input.outputGif ? ["--output-gif", "erosion-animation.gif", "--gif-fps", String(input.gifFps), "--gif-skip", String(input.gifSkip)] : []),
        "--output", output];
    case "erosion_file":
      return ["erosion", "--input", required("coastlineInputId"),
        "--wave-input", required("waveInputId"), "--wave-source", requiredSource("waveInputId"),
        "--bathymetry", required("bathymetryInputId"), ...cercArguments(input), ...cercProfileArguments(),
        ...(input.outputCsv ? ["--output-csv", "erosion-metrics.csv", "--csv-format", String(input.csvFormat)] : []),
        ...(input.outputGif ? ["--output-gif", "erosion-animation.gif", "--gif-fps", String(input.gifFps), "--gif-skip", String(input.gifSkip)] : []),
        "--output", output];
    case "all_demo":
      return ["all", "--black-sea-sochi", "--offline", ...cercArguments(input),
        ...allExportArguments(input),
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
