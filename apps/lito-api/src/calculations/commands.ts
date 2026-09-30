import { BadRequestException } from "@nestjs/common";
import type {
  CalculationKindDto,
  CreateCalculationDto,
} from "@litora/contracts";

export const calculationKinds: CalculationKindDto[] = [
  {
    kind: "dimension",
    title: "Фрактальная размерность",
    description:
      "Box-counting для поставляемой береговой линии. JSON-метрики и SVG-отчёт.",
  },
  {
    kind: "dimension_dataset",
    title: "Размерность своей береговой линии",
    description:
      "Box-counting по загруженному GeoJSON LineString. Геометрия проверяется Go при запуске.",
  },
  {
    kind: "map",
    title: "Карта Чёрного моря",
    description:
      "Обзорная схема из локального набора данных. SVG и GeoJSON; не заменяет съёмочный контур.",
  },
  {
    kind: "erosion",
    title: "Эрозия: демонстрационный сценарий Сочи",
    description:
      "Модель CERC на поставляемых волновых и батиметрических данных. Демонстрация, не прогноз годового размыва.",
  },
];

export function validateCalculation(body: unknown): CreateCalculationDto {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Ожидается объект расчёта");
  const data = body as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => !["kind", "input"].includes(key)) ||
    !calculationKinds.some((item) => item.kind === data.kind)
  )
    throw new BadRequestException("Неизвестный тип расчёта или поле");
  const input = data.input ?? {};
  if (typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("input должен быть объектом");
  const parameters = input as Record<string, unknown>;
  if (
    Object.keys(parameters).some((key) =>
      data.kind === "erosion"
        ? key !== "steps"
        : data.kind === "dimension_dataset"
          ? key !== "datasetId"
          : true,
    )
  )
    throw new BadRequestException("Недопустимые параметры расчёта");
  if (
    parameters.steps !== undefined &&
    (!Number.isInteger(parameters.steps) ||
      Number(parameters.steps) < 1 ||
      Number(parameters.steps) > 48)
  )
    throw new BadRequestException("Число шагов: целое от 1 до 48");
  if (
    data.kind === "dimension_dataset" &&
    (typeof parameters.datasetId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parameters.datasetId,
      ))
  )
    throw new BadRequestException("Укажите UUID своего набора данных");
  return {
    kind: data.kind as CreateCalculationDto["kind"],
    input:
      data.kind === "erosion"
        ? { steps: Number(parameters.steps ?? 3) }
        : data.kind === "dimension_dataset"
          ? { datasetId: parameters.datasetId as string }
          : {},
  };
}

export function commandArguments(
  job: CreateCalculationDto,
  output: string,
  datasetPath?: string,
): string[] {
  const validated = validateCalculation(job);
  switch (validated.kind) {
    case "dimension":
      return [
        "dimension",
        "--input",
        "data/black-sea.json",
        "--output",
        output,
      ];
    case "dimension_dataset":
      if (!datasetPath)
        throw new Error(
          "Для пользовательского расчёта нужен серверный путь набора",
        );
      return ["dimension", "--input", datasetPath, "--output", output];
    case "map":
      return [
        "map",
        "black-sea",
        "--input",
        "data/black-sea.json",
        "--output",
        output,
      ];
    case "erosion":
      return [
        "erosion",
        "--steps",
        String(validated.input!.steps),
        "--output",
        output,
      ];
  }
}
