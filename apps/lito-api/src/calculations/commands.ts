import { BadRequestException } from "@nestjs/common";
import { erosionDemoDefaults, scientificInputRequirements } from "@litora/contracts";
import type {
  CalculationKind,
  CalculationKindDto,
  CreateCalculationDto,
  ScientificInputRole,
} from "@litora/contracts";

export const calculationKinds: CalculationKindDto[] = [
  { kind: "source_file", title: "Проверить источник береговой линии", description: "Проверка загруженного контура и сохранение его снимка с манифестом." },
  { kind: "dimension", title: "Фрактальная размерность", description: "Box-counting поставляемой береговой линии: метрики и SVG." },
  { kind: "dimension_dataset", title: "Размерность своей береговой линии", description: "Box-counting небольшого GeoJSON LineString." },
  { kind: "dimension_file", title: "Размерность полного контура", description: "Box-counting загруженного GeoJSON, включая полный контур Чёрного моря." },
  { kind: "map", title: "Карта Чёрного моря", description: "Обзорная SVG и GeoJSON на поставляемой геометрии." },
  { kind: "map_file", title: "Карта своего контура", description: "Обзорная SVG и GeoJSON по загруженному контуру Чёрного моря." },
  { kind: "erosion", title: "Эрозия: демонстрационный сценарий Сочи", description: "CERC на закреплённых данных; демонстрация, не прогноз." },
  { kind: "mesh", title: "Плоская сетка Чёрного моря", description: "Gmsh строит MSH и SVG обзоры сеток по загруженному полному контуру." },
  { kind: "seabed_build", title: "Построить модель дна", description: "Назначить глубины плоской сетке и получить MSH, VTU, CSV и паспорт экспорта." },
  { kind: "seabed_render", title: "Карты и 3D-рельеф дна", description: "SVG карты глубин, фрагментов фактической сетки, 3D-рельефа и профилей из готовой модели MSH." },
  { kind: "seabed_adapt", title: "Поле размера адаптивной сетки", description: "CSV, JSON и SVG поля h(x,y) из принятой модели дна." },
  { kind: "seabed_generate_adaptive", title: "Построить адаптивную сетку", description: "Gmsh создаёт фактическую full-quad MSH из поля размера ADAPT-01." },
  { kind: "seabed_validate", title: "Проверить модель дна", description: "Сравнение с отдельной опорной моделью: глубины, изобаты, уклоны и размеры." },
  { kind: "seabed_compare_adaptive", title: "Сравнение генераторов сетки", description: "Сравнение Gmsh на общем поле и контуре; MSH, SVG и отчёты. Тяжёлый расчёт." },
];

export const scientificInputFields = scientificInputRequirements;

export function resourceProfileForKind(kind: CalculationKind) {
  return kind === "source_file" || kind === "dimension_file" || kind === "map_file" ||
    kind === "mesh" || kind.startsWith("seabed_")
    ? "heavy" : "standard";
}

export function scientificReferences(job: CreateCalculationDto) {
  const fields = scientificInputFields[job.kind as keyof typeof scientificInputFields];
  if (!fields) return [] as { field: string; id: string; role: ScientificInputRole }[];
  const input = job.input ?? {};
  return Object.entries(fields).map(([field, role]) => ({
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

function references(input: Record<string, unknown>, fields: Record<string, ScientificInputRole>) {
  const result: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
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
      if (p.outputCsv !== undefined && typeof p.outputCsv !== "boolean")
        throw new BadRequestException("Недопустимый флаг экспорта CSV");
      if (p.csvFormat !== undefined && p.csvFormat !== "long" && p.csvFormat !== "wide")
        throw new BadRequestException("Формат CSV должен быть long или wide");
      return { kind: "erosion", input: {
        steps: numberIn(p.steps ?? erosionDemoDefaults.steps, "Шаги", 1, 48, true),
        breakingIndex: numberIn(p.breakingIndex ?? erosionDemoDefaults.breakingIndex, "Индекс разрушения", 0.55, 1.2),
        bermHeight: numberIn(p.bermHeight ?? erosionDemoDefaults.bermHeight, "Высота бермы", 0.001, 100),
        closureDepth: numberIn(p.closureDepth ?? erosionDemoDefaults.closureDepth, "Глубина замыкания", 0.001, 1000),
        porosity: numberIn(p.porosity ?? erosionDemoDefaults.porosity, "Пористость", 0.000001, 0.699999),
        cercCoefficient: numberIn(p.cercCoefficient ?? erosionDemoDefaults.cercCoefficient, "Коэффициент CERC", 0.000001, 1),
        offshoreSampleDistance: numberIn(p.offshoreSampleDistance ?? erosionDemoDefaults.offshoreSampleDistance, "Отбор глубины", 1, 100000),
        maxShorelineChange: numberIn(p.maxShorelineChange ?? erosionDemoDefaults.maxShorelineChange, "Предел смещения", 0.001, 1000),
        maxBathymetryGap: numberIn(p.maxBathymetryGap ?? erosionDemoDefaults.maxBathymetryGap, "Радиус батиметрии", 1, 100000),
        outputCsv: p.outputCsv ?? erosionDemoDefaults.outputCsv,
        csvFormat: p.csvFormat ?? erosionDemoDefaults.csvFormat,
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
      const isobaths = p.isobaths ?? "20,50,100,200,500,1000,1500,2000";
      if (typeof isobaths !== "string" || !/^[0-9]{1,4}(,[0-9]{1,4}){0,15}$/.test(isobaths))
        throw new BadRequestException("Изобаты: до 16 положительных глубин через запятую");
      if (isobaths.split(",").some((value) => Number(value) <= 0))
        throw new BadRequestException("Глубины изобат должны быть положительными");
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
      const isobaths = p.isobaths ?? "20,200,1000,2000";
      if (typeof isobaths !== "string" || !/^[0-9]{1,4}(,[0-9]{1,4}){0,15}$/.test(isobaths) ||
          isobaths.split(",").some((value) => Number(value) <= 0))
        throw new BadRequestException("Изобаты: до 16 положительных глубин через запятую");
      return { kind: "seabed_validate", input: {
        ...references(p, fields), isobaths,
        worstCells: numberIn(p.worstCells ?? 20, "Число худших ячеек", 1, 1000, true),
        maxNearestDistance: numberIn(p.maxNearestDistance ?? 0, "Предел поиска глубины", 0, 100000),
      } };
    }
    case "seabed_compare_adaptive": {
      const fields = scientificInputFields.seabed_compare_adaptive;
      rejectUnknown(p, [...Object.keys(fields), "boundaryDetail", "generators", "levels", "levelMin", "levelMax", "maxCells", "allowLarge", "generatorTimeoutMinutes", "detailPreset"]);
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
      return { kind: "seabed_compare_adaptive", input: {
        ...references(p, fields),
        boundaryDetail: numberIn(p.boundaryDetail ?? 50, "Детализация берега", 10, 10000),
        generators, levels, detailPreset,
        maxCells: numberIn(p.maxCells ?? 25_000_000, "Лимит ячеек", 1000, 25_000_000, true),
        allowLarge: p.allowLarge ?? false,
        generatorTimeoutMinutes: numberIn(p.generatorTimeoutMinutes ?? 20, "Время Gmsh", 1, 120, true),
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
): string[] {
  const validated = validateCalculation(job);
  const input = validated.input ?? {};
  const required = (key: string) => {
    if (!files[key]) throw new Error(`Не подготовлен научный файл ${key}`);
    return files[key];
  };
  switch (validated.kind) {
    case "dimension":
      return ["dimension", "--input", "data/black-sea.json", "--output", output];
    case "dimension_dataset":
      if (!datasetPath) throw new Error("Для пользовательского расчёта нужен серверный путь набора");
      return ["dimension", "--input", datasetPath, "--output", output];
    case "dimension_file":
      return ["dimension", "--input", required("coastlineInputId"), "--output", output];
    case "source_file":
      return ["source", "--input", required("coastlineInputId"), "--output", output];
    case "map":
      return ["map", "black-sea", "--input", "data/black-sea.json", "--output", output];
    case "map_file":
      return ["map", "black-sea", "--input", required("coastlineInputId"), "--output", output];
    case "erosion":
      return ["erosion", "--black-sea-sochi", "--offline", "--steps", String(input.steps),
        "--breaking-index", String(input.breakingIndex),
        "--berm-height", String(input.bermHeight),
        "--closure-depth", String(input.closureDepth),
        "--porosity", String(input.porosity),
        "--cerc-coefficient", String(input.cercCoefficient),
        "--offshore-sample-distance", String(input.offshoreSampleDistance),
        "--max-shoreline-change", String(input.maxShorelineChange),
        "--max-bathymetry-gap", String(input.maxBathymetryGap),
        ...(input.outputCsv ? ["--output-csv", "erosion-metrics.csv", "--csv-format", String(input.csvFormat)] : []),
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
        "--output", output];
  }
}
