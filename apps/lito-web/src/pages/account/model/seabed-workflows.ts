import { scientificInputRequirements } from "@litora/contracts";
import type {
  CalculationJobDto,
  CalculationKind,
  ReusableScientificArtifactDto,
  ScientificInputDto,
} from "@litora/contracts";

export const seabedWorkflows = [
  { id: "bathymetry", kind: "seabed_render", title: "Рисунок 3 · Обзор глубин", description: "Карта батиметрии, изобаты и зоны рельефа из готовой модели дна." },
  { id: "size-field", kind: "seabed_adapt", title: "Рисунок 4 · Поле размера ячеек", description: "Поле h(x,y) 200–1000 м, CSV признаков и JSON. Это задание размера для будущей сетки." },
  { id: "mesh-fragments", kind: "seabed_render", title: "Рисунок 5 · Фактическая сетка", description: "Контрольные фрагменты MSH: все ячейки в окнах, качество и изобаты без прореживания." },
  { id: "mesh", kind: "mesh", title: "Построить плоскую сетку", description: "Контур моря → full-quad MSH с помощью Gmsh." },
  { id: "build", kind: "seabed_build", title: "Назначить глубины сетке", description: "Плоская MSH и батиметрия GEBCO с паспортом → модель дна." },
] as const satisfies readonly { id: string; kind: CalculationKind; title: string; description: string }[];

export type SeabedWorkflowId = typeof seabedWorkflows[number]["id"];

export function parseSeabedWorkflow(value: string | null) {
  return seabedWorkflows.find((item) => item.id === value)?.id;
}

export function seabedWorkflowUrl(workflow: SeabedWorkflowId, sourceJobId?: string) {
  const query = new URLSearchParams({ new: "1", workflow });
  if (sourceJobId) query.set("source", sourceJobId);
  return `/lab/calculations?${query}`;
}

// Переносим только однозначные UUID с подходящей ролью. Совместимость файлов
// и владение повторно проверяет API, научную совместимость — Go.
export function workflowInputs(
  workflow: SeabedWorkflowId,
  source: CalculationJobDto | null,
  inputs: ScientificInputDto[],
  artifacts: ReusableScientificArtifactDto[],
): Record<string, string> {
  if (!source || source.status !== "succeeded" || source.deletionRequestedAt) return {};
  const kind = seabedWorkflows.find((item) => item.id === workflow)!.kind;
  const target = scientificInputRequirements[kind];
  const sourceRequirements = scientificInputRequirements[source.kind as keyof typeof scientificInputRequirements];
  const available = [
    ...inputs.filter((item) => item.status === "ready"),
    ...artifacts,
  ];
  const result: Record<string, string> = {};
  for (const [field, role] of Object.entries(target)) {
    const outputs = artifacts.filter((item) => item.jobId === source.id && item.role === role);
    const inheritedIds = Object.entries(sourceRequirements ?? {})
      .filter(([, inputRole]) => inputRole === role)
      .map(([key]) => source.input[key]);
    const inherited = available.filter((item) => item.role === role && inheritedIds.includes(item.id));
    const candidates = outputs.length ? outputs : inherited;
    if (candidates.length === 1) result[field] = candidates[0].id;
  }
  const model = artifacts.find((item) => item.id === result.modelInputId && item.role === "seabed_msh");
  if (model) {
    for (const [field, role] of Object.entries(target)) {
      if (result[field]) continue;
      const related = artifacts.filter((item) => item.jobId === model.jobId && item.role === role);
      if (related.length === 1) result[field] = related[0].id;
    }
  }
  return result;
}

export const seabedReportLabels: Record<string, { title: string; description: string }> = {
  "seabed/svg/bathymetry-overview.svg": { title: "Рисунок 3 · Обзор глубин", description: "Батиметрия, изобаты и зоны рельефа." },
  "seabed/svg/size-field.svg": { title: "Рисунок 4 · Поле размера ячеек", description: "Цвет показывает целевую длину ребра h(x,y), а не глубину. Новая сетка ещё не построена." },
  "seabed/svg/mesh-details.svg": { title: "Рисунок 5 · Фактическая сетка", description: "Все ячейки контрольных окон без прореживания; цвет показывает геометрическое качество." },
};
