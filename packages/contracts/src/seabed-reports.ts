/** Представления модели дна; вычисления и формирование файлов выполняет Go. */
export const seabedReports = [
  {
    type: "bathymetry_overview", kind: "seabed_render",
    title: "Обзор глубин", figure: "Рисунок 3",
    description: "Карта глубин, изобат и зон рельефа из принятой модели дна. Цвет показывает глубину в метрах.",
    filename: "seabed/svg/bathymetry-overview.svg",
  },
  {
    type: "size_field", kind: "seabed_adapt",
    title: "Поле размера ячеек", figure: "Рисунок 4",
    description: "Цвет показывает целевую длину ребра h(x,y) в метрах. Новая сетка ещё не построена; сохраняются также CSV признаков и JSON параметров.",
    filename: "seabed/svg/size-field.svg",
  },
  {
    type: "mesh_details", kind: "seabed_render",
    title: "Фрагменты фактической сетки", figure: "Рисунок 5",
    description: "Сложный берег, шельф и склон: все ячейки контрольных окон без прореживания. Цвет показывает качество формы, а не точность глубины.",
    filename: "seabed/svg/mesh-details.svg",
  },
] as const;

export type SeabedReportType = typeof seabedReports[number]["type"];

/** Проверяет сочетание вида расчёта и внешнего значения подтипа отчёта. */
export function findSeabedReport(kind: string, value: unknown) {
  return seabedReports.find((report) => report.kind === kind && report.type === value);
}
