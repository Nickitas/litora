import { seabedReports } from "./seabed-reports.js";

const dimensionKinds = ["dimension", "dimension_dataset", "dimension_file"] as const;

/** Два представления одного анализа наблюдаемой геометрии; вычисляет Go. */
export const dimensionReports = [
  {
    type: "coastline_box_counting", kinds: dimensionKinds,
    title: "Берег и аналитическая сетка", figure: "Рисунок 1",
    description: "Исходный берег, сетка box-counting и размерность D. Это аналитическая сетка подсчёта покрытия, а не расчётная MSH дна.",
    filename: "svg/dimension_0.svg",
  },
  {
    type: "box_counting_regression", kinds: dimensionKinds,
    title: "График регрессии", figure: "Рисунок 2",
    description: "Масштабы, усреднённое покрытие и окно регрессии того же анализа. Наклон D и R² вычисляет Go; метрики и сведения об источнике доступны вместе с SVG.",
    filename: "svg/dimension_loglog_0.svg",
  },
] as const;

/** Представления текущего сравнения; имена отдельных SVG определяет индекс Go. */
export const adaptiveComparisonReports = [
  {
    type: "adaptive_mesh_overviews", kinds: ["seabed_compare_adaptive"],
    title: "Обзоры построенных сеток", figure: "ADAPT-03",
    description: "Сетки каждого успешно завершившегося генератора и уровня. Подписи и диапазоны берутся из паспорта текущего сравнения.",
    filename: null, indexFilename: "seabed/adaptive/comparison/comparison-visual-reports.json",
  },
  {
    type: "adaptive_mesh_windows", kinds: ["seabed_compare_adaptive"],
    title: "Подробные окна сеток", figure: "ADAPT-03",
    description: "Кызылырмакская коса: окно 4,2 × 2,6 км в двух вариантах оформления. Go отбирает ячейки по центрам; если в окне нет их центров, SVG не создаётся.",
    filename: null, indexFilename: "seabed/adaptive/comparison/comparison-visual-reports.json",
  },
  {
    type: "expert_fragment_cards", kinds: ["seabed_compare_adaptive"],
    title: "Анонимные карточки AI-01", figure: "Тип представления рисунков 6–7",
    description: "Восемь фрагментов с исходным берегом, изобатами и построенной сеткой; сетки должны покрывать все окна. Генератор и уровень скрыты; E-номер действует только внутри текущего набора. Точный архивный повтор требует исходных файлов и согласованных паспортов.",
    filename: null, indexFilename: "seabed/expert-set/expert-visual-reports.json",
  },
] as const;

/** Подтверждённые представления результатов без дополнительных научных вычислений в TS. */
export const calculationReports = [
  ...seabedReports.map((report) => ({ ...report, kinds: [report.kind] })),
  ...dimensionReports,
  ...adaptiveComparisonReports,
] as const;

export type CalculationReportType = typeof calculationReports[number]["type"];

/** Ищет совместимый отчёт по виду расчёта и внешнему значению подтипа. */
export function findCalculationReport(kind: string, value: unknown) {
  return calculationReports.find((report) => report.type === value && report.kinds.some((allowed) => allowed === kind));
}
