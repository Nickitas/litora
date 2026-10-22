import { calculationTextParameters, type CalculationKind } from "@litora/contracts";

const controlGuidance: Record<string, string> = {
  csvFormat: "long — строка на точку и состояние; wide — широкая таблица. Для полного ряда доступен только long.",
  validationStart: "Необязательная дата UTC. Задайте её до анализа: наблюдения должны быть по обе стороны границы независимой проверки.",
  expertLevels: "ID уровней из списка сравнения через запятую; пусто — все уровни. Выберите набор до экспертной оценки.",
  expertSeed: "1–80 символов: латиница, цифры, _ и -. Воспроизводит анонимизацию карточек, не влияет на расчёт сетки.",
  figureFiveLevel: "Один ID уровня из выбранного экспертного набора. Должен присутствовать в levels и expertLevels.",
  figureFiveGenerator: "Один из генераторов выбранного сравнения. Рисунок строится по фактическим карточкам экспертного набора.",
};

export function CalculationParameterHint({ kind, parameter, inputId }: {
  kind: CalculationKind;
  parameter: string;
  inputId: string;
}) {
  const guidance = calculationTextParameters[kind]?.[parameter]?.guidance ?? controlGuidance[parameter];
  if (!guidance) return null;
  return <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">{guidance}</p>;
}
