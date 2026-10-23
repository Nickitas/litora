import type { CalculationKind } from "./index.js";

/** Технические ограничения HTTP, единицы и основание выбора; не научный рабочий диапазон. */
export interface NumericCalculationParameter {
  label: string;
  unit: string;
  minimum: number;
  maximum: number;
  integer: boolean;
  defaultValue: number | undefined;
  excludedValues?: readonly number[];
  guidance: string;
}

function parameter(label: string, unit: string, minimum: number, maximum: number,
  defaultValue: number | undefined, guidance: string, integer = false): NumericCalculationParameter {
  return { label, unit, minimum, maximum, defaultValue, guidance, integer };
}

const cerc = {
  breakingIndex: parameter("Индекс разрушения волн", "безразмерный", 0.55, 1.2, undefined, "Укажите по прибойным условиям участка. Универсальное значение для ваших данных не установлено."),
  bermHeight: parameter("Высота бермы", "м", 0.001, 100, undefined, "Нужны измерения активного профиля или обоснование по наблюдениям участка."),
  closureDepth: parameter("Глубина замыкания", "м", 0.001, 1000, undefined, "Возьмите из исследования активного профиля участка; разрешение батиметрии не определяет эту глубину."),
  porosity: parameter("Пористость наносов", "доля", 0.000001, 0.699999, undefined, "Укажите характеристику реальных наносов участка; отсутствие измерений не заменяется типовым числом."),
  cercCoefficient: parameter("Коэффициент CERC", "безразмерный", 0.000001, 1, undefined, "Требуется выбранный и обоснованный коэффициент, например из независимой калибровки участка."),
  offshoreSampleDistance: parameter("Расстояние отбора глубины", "м", 1, 100000, undefined, "Выберите по положению прибрежного профиля и фактическому покрытию батиметрии."),
  maxBathymetryGap: parameter("Радиус поиска глубины", "м", 1, 100000, undefined, "Обоснуйте разрешением, покрытием и неопределённостью источника. Большой радиус не добавляет измерений."),
  leftBoundaryTransport: parameter("Поток через левую границу", "м³/с", -1000000, 1000000, undefined, "Положительный поток входит в сегмент. Явный 0 означает принятое условие отсутствия потока, а не неизвестный баланс."),
  rightBoundaryTransport: parameter("Поток через правую границу", "м³/с", -1000000, 1000000, undefined, "Положительный поток выходит из сегмента. Явный 0 требует обоснования граничного условия."),
};

const cercRun = {
  ...cerc,
  steps: parameter("Состояния волнового ряда", "состояний", 0, 48, 3, "3 — короткий технический запуск первых состояний; 0 — весь ряд с лимитами. Длительность задаётся волновыми данными, а не числом состояний.", true),
  svgMaxFrames: parameter("Максимум SVG", "кадров", 0, 128, 0, "Ограничивает изображения, не численный ряд. Для полного ряда выберите 2–128 кадров.", true),
  maxShorelineChange: parameter("Предел смещения за состояние", "м", 0.001, 1000, 25, "Защитный предел реализации, не допустимая природная скорость. При его достижении разберите результат и входы."),
  gifFps: parameter("Частота GIF", "кадров/с", 1, 30, 10, "Настройка воспроизведения; не меняет длительность состояний волн.", true),
  gifSkip: parameter("Шаг кадров GIF", "кадров", 1, 48, 1, "1 сохраняет каждый кадр. Не прореживает численные шаги.", true),
};

const maxCells = parameter("Лимит ячеек", "ячеек", 1000, 25000000, 5000000, "Защитная оценка ресурсов одного запуска; не критерий научного качества.", true);
const timeout = parameter("Время генератора", "мин", 1, 120, 20, "Лимит одного запуска Gmsh; общий лимит worker может завершить задание раньше.", true);
const boundaryDetail = parameter("Детализация берега", "м", 10, 10000, 1000, "Стартовый технический допуск. Согласуйте с точностью исходной геометрии; это не точность съёмки.");
const sourceDistance = parameter("Предел поиска глубины", "м", 100, 100000, undefined, "Выберите по покрытию и неопределённости реальной батиметрии. Отсутствующие данные нельзя скрывать увеличением радиуса.");
const coastTransition = parameter("Переход к береговому нулю", "м", 0, 100000, 0, "0 включает автоматический переход по размеру рёбер в ядре. Переход к нулю — допущение модели, которое нужно учитывать при интерпретации.");
const vertical = parameter("Вертикальное преувеличение", "множитель", 1, 200, 40, "Настройка рисунка из CLI; научные отметки и глубины модели не меняются.");

/** Поля, для которых новый запуск требует явных значений участка. */
export const cercSiteParameterNames = Object.keys(cerc) as (keyof typeof cerc)[];

/** Параметры поля размера с техническими начальными настройками алгоритма Go. */
export const adaptiveParameterDefinitions = {
  minSize: parameter("Минимальный размер", "м", 1, 100000, 200, "Начальная настройка алгоритма; выберите по разрешению данных и исследованию сходимости."),
  coastSize: parameter("Размер у берега", "м", 1, 100000, 300, "Начальная настройка алгоритма; согласуйте с точностью береговой геометрии."),
  shelfSize: parameter("Размер на шельфе", "м", 1, 100000, 500, "Начальная настройка алгоритма; уточните по задаче и источнику."),
  deepSize: parameter("Размер глубоководья", "м", 1, 100000, 1000, "Начальная настройка алгоритма; более мелкая сетка не добавляет исходных измерений."),
  coastInfluence: parameter("Дальность влияния берега", "м", 1, 1000000, 25000, "Начальная настройка алгоритма. Проверьте чувствительность результата на своём участке."),
  curvatureReference: parameter("Опорный поворот берега", "°", 0.001, 180, 30, "Начальная настройка алгоритма; обоснуйте геометрией своего контура."),
  slopeReference: parameter("Опорный уклон дна", "°", 0.001, 90, 10, "Начальная настройка алгоритма; сопоставьте с реальной батиметрией."),
  flatDeepSlope: parameter("Максимальный уклон глубоководья", "°", 0.001, 90, 1, "Условие выделения ровного глубоководья; требует проверки на своих данных."),
  maxNeighbourRatio: parameter("Отношение соседних размеров", "отношение", 1.000001, 100, 1.25, "Ограничение плавности из настроек Go. Проверьте качество итоговой сетки."),
  maxSizeGradient: parameter("Предельный рост размера", "м/м", 0.000001, 100, 0.15, "Ограничение плавности из настроек Go; не универсальный научный порог."),
};

const calibrationCerc = {
  breakingIndex: cerc.breakingIndex, bermHeight: cerc.bermHeight, closureDepth: cerc.closureDepth,
  porosity: cerc.porosity, offshoreSampleDistance: cerc.offshoreSampleDistance,
  maxBathymetryGap: cerc.maxBathymetryGap, leftBoundaryTransport: cerc.leftBoundaryTransport,
  rightBoundaryTransport: cerc.rightBoundaryTransport,
};

/** Единые transport-ограничения API и формы. Научная совместимость проверяется Go. */
export const calculationNumericParameters: Partial<Record<CalculationKind, Readonly<Record<string, NumericCalculationParameter>>>> = {
  coastline_region: {
    west: parameter("Западная долгота", "°", 27, 42.5, undefined, "Граница участка в WGS84; должна быть меньше восточной долготы."),
    east: parameter("Восточная долгота", "°", 27, 42.5, undefined, "Граница участка в WGS84; должна быть больше западной долготы."),
    south: parameter("Южная широта", "°", 40.5, 47.5, undefined, "Граница участка в WGS84; должна быть меньше северной широты."),
    north: parameter("Северная широта", "°", 40.5, 47.5, undefined, "Граница участка в WGS84; должна быть больше южной широты."),
  },
  erosion_file: cercRun,
  all_file: {
    ...cercRun,
    modelMaxPoints: { ...parameter("Лимит точек модели", "точек", 0, 10000, 0, "0 не задаёт явный лимит; 1 запрещена. При индексных профилях упрощение нужно отключить.", true), excludedValues: [1] },
  },
  calibrate_cerc: {
    ...calibrationCerc,
    bathymetryResolution: parameter("Фактический шаг батиметрии", "°", 0.000000001, 0.1, undefined, "Точное значение из паспорта выбранного набора; Go проверит совпадение. Предел 0.1° — ограничение реализации, не рекомендация качества."),
    maxObservationDistance: parameter("Дистанция наблюдения до берега", "м", 1, 100000, undefined, "Обоснуйте точностью наблюдений и пространственным сопоставлением с сегментом."),
    minWaveHours: parameter("Минимальное покрытие волн", "ч", 8766, 100000, 8766, "Минимум годового протокола Go. Одного числа часов недостаточно для подтверждения полноты и репрезентативности ряда."),
  },
  mesh: { maxCells, generatorTimeoutMinutes: timeout },
  seabed_build: {
    boundaryDetail, maxSourceDistance: sourceDistance, coastTransition,
    maxNodes: { ...maxCells, label: "Лимит узлов", unit: "узлов" }, maxCells,
    maxOutputMiB: parameter("Лимит экспорта", "МиБ", 1, 8192, 2048, "Защитная оценка размера экспортов; квоты worker остаются отдельным ограничением.", true),
  },
  seabed_render: { verticalExaggeration: vertical },
  seabed_adapt: adaptiveParameterDefinitions,
  seabed_generate_adaptive: { boundaryDetail: { ...boundaryDetail, defaultValue: 200 }, maxCells, generatorTimeoutMinutes: timeout },
  seabed_validate: {
    worstCells: parameter("Проблемные ячейки в отчёте", "ячеек", 1, 1000, 20, "Число показываемых ячеек. Проверка выполняется для всей модели.", true),
    maxNearestDistance: parameter("Предел ближайшей замены", "м", 0, 100000, 0, "0 — автоматический предел по разрешению опорного источника в Go. Явный предел обоснуйте точностью эталона."),
  },
  seabed_compare_adaptive: { boundaryDetail: { ...boundaryDetail, defaultValue: 50 }, maxCells: { ...maxCells, defaultValue: 25000000 }, generatorTimeoutMinutes: timeout },
  seabed_assess_ml: {
    minExpertsPerCard: parameter("Экспертов на карточку", "экспертов", 2, 10, 2, "Начальный порог протокола AI-02, не подтверждение достаточности экспертной выборки.", true),
    minTraining: parameter("Минимум карточек обучения", "карточек", 2, 96, 12, "Начальный порог протокола; достаточность выборки обосновывается отдельно.", true),
    minEvaluation: parameter("Минимум карточек проверки", "карточек", 2, 96, 12, "Отложенная выборка должна быть независимой; начальный порог не доказывает статистическую мощность.", true),
    ridgeLambda: parameter("Ridge-регуляризация", "параметр", 0.000001, 1000, 1, "Начальная настройка протокола обучения. Уточняйте без подбора по отложенной проверке."),
    minRmseImprovement: parameter("Минимальное улучшение RMSE", "доля", 0.001, 0.99, 0.1, "Начальный критерий протокола: 0.1 означает 10%. Зафиксируйте критерий до оценки результата."),
  },
  seabed_check_full: {
    boundaryDetail, maxSourceDistance: sourceDistance, coastTransition,
    targetEdge: parameter("Контрольное ребро", "м", 10, 10000, 1000, "Укажите длину выбранного запуска из mesh-report; значение 1000 — стартовая настройка CLI, не рекомендация для любой акватории."),
    verticalExaggeration: vertical,
  },
};

/** Возвращает проверенное числовое значение транспорта или объяснение ошибки. */
export function resolveNumericCalculationParameter(kind: CalculationKind, name: string, value: unknown): number {
  const definition = calculationNumericParameters[kind]?.[name];
  if (!definition) throw new Error(`Не описан параметр «${name}»`);
  const resolved = value === undefined ? definition.defaultValue : value;
  if (resolved === undefined) throw new Error(`Укажите параметр участка «${definition.label}» по своим данным`);
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < definition.minimum ||
    resolved > definition.maximum || definition.integer && !Number.isInteger(resolved) || definition.excludedValues?.includes(resolved))
    throw new Error(`Недопустимое значение «${definition.label}»: технический диапазон ${definition.minimum}…${definition.maximum} ${definition.unit}${definition.integer ? ", целое число" : ""}${definition.excludedValues?.length ? `; исключены: ${definition.excludedValues.join(", ")}` : ""}`);
  return resolved;
}

/** Проверяет зависимые transport-параметры; не проверяет научную пригодность данных. */
export function calculationParameterCombinationError(kind: CalculationKind, input: Record<string, unknown>): string | undefined {
  if (kind === "seabed_compare_adaptive") {
    if (input.reportType === "adaptive_mesh_windows" && input.detailPreset !== "kizilirmak")
      return "Для выбранного отчёта включите подробное окно Кызылырмакской косы";
    if (input.reportType === "expert_fragment_cards" && input.generateExpertSet !== true)
      return "Для выбранного отчёта включите подготовку карточек AI-01";
    if (input.generateExpertSet === true && typeof input.generators === "string" && input.generators.split(",").length < 2)
      return "Для экспертных карточек нужны минимум два генератора";
  }
  if (kind === "mesh" && typeof input.cellSizes === "string" && typeof input.boundaryDetails === "string" &&
    input.boundaryDetails.split(",").length !== 1 && input.boundaryDetails.split(",").length !== input.cellSizes.split(",").length)
    return "Количество детализаций должно быть равно числу размеров или одному";
  if (kind === "erosion_file" || kind === "all_file") {
    if (input.steps === 0 && (typeof input.svgMaxFrames !== "number" || input.svgMaxFrames < 2))
      return "Для полного волнового ряда укажите от 2 до 128 SVG";
    if (input.steps === 0 && input.outputGif)
      return "GIF для полного волнового ряда недоступен из-за расхода памяти";
    if (input.steps === 0 && input.outputCsv && input.csvFormat === "wide")
      return "Для полного волнового ряда используйте длинный CSV";
    if (kind === "all_file" && typeof input.modelMaxPoints === "number" && input.modelMaxPoints > 0 && input.noModelSimplify === true)
      return "Отключение упрощения несовместимо с заданным числом точек";
  }
  if (kind === "seabed_adapt") {
    const { minSize, coastSize, shelfSize, deepSize } = input;
    if (typeof minSize !== "number" || typeof coastSize !== "number" || typeof shelfSize !== "number" || typeof deepSize !== "number" ||
      !(minSize <= coastSize && coastSize <= shelfSize && shelfSize <= deepSize))
      return "Размеры должны удовлетворять min ≤ coast ≤ shelf ≤ deep";
  }
  if (kind === "coastline_region" && typeof input.west === "number" && typeof input.east === "number" &&
    typeof input.south === "number" && typeof input.north === "number" && (input.west >= input.east || input.south >= input.north))
    return "Запад должен быть меньше востока, а юг — меньше севера";
  return undefined;
}
