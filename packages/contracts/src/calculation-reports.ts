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

/** Подтверждённые представления результатов без дополнительных научных вычислений в TS. */
export const calculationReports = [
  ...seabedReports.map((report) => ({ ...report, kinds: [report.kind] })),
  ...dimensionReports,
] as const;

export type CalculationReportType = typeof calculationReports[number]["type"];

/** Ищет совместимый отчёт по виду расчёта и внешнему значению подтипа. */
export function findCalculationReport(kind: string, value: unknown) {
  return calculationReports.find((report) => report.type === value && report.kinds.some((allowed) => allowed === kind));
}
