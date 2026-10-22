import type { CalculationKind } from "./index.js";

type TextParameterFormat = "lengths" | "levels" | "isobaths" | "coefficients" | "generators" | "generator" | "detailPreset";

/** Формат транспортного параметра и пояснение выбора; не научный диапазон. */
export interface TextCalculationParameter {
  label: string;
  format: TextParameterFormat;
  defaultValue: string | undefined;
  guidance: string;
  allowedValues?: readonly string[];
}

const singleGenerators = ["delaunay", "frontal-quad", "parallelograms"] as const;
const generators = { label: "Генераторы", format: "generators", defaultValue: "frontal-quad",
  allowedValues: [...singleGenerators, "delaunay,frontal-quad", "delaunay,frontal-quad,parallelograms"],
  guidance: "Разрешены три одиночных генератора, пара Delaunay + Frontal-quad или все три. Сравнивайте принятые сетки по одному протоколу; универсального лучшего генератора нет." } as const;
const isobaths = { label: "Изобаты", format: "isobaths", defaultValue: "20,50,100,200,500,1000,1500,2000",
  guidance: "Метров глубины: 1–16 положительных значений до 10000, до трёх знаков после точки, через запятую. Начальный набор — оформление рисунка; выберите уровни анализа заранее." } as const;
const generator = { label: "Генератор", format: "generator", defaultValue: "delaunay", allowedValues: singleGenerators, guidance: "Один из трёх разрешённых генераторов Gmsh. Стартовая настройка не гарантирует наилучшее качество на вашем контуре." } as const;

/** Текстовые параметры с общей runtime-проверкой API и формы. */
export const calculationTextParameters: Partial<Record<CalculationKind, Readonly<Record<string, TextCalculationParameter>>>> = {
  mesh: {
    cellSizes: { label: "Длины рёбер", format: "lengths", defaultValue: "1000", guidance: "Метры: 1–4 целых числа через запятую, каждое 10–10000. 1000 — технический старт; проверьте разрешение источника и сходимость." },
    boundaryDetails: { label: "Детализация берега", format: "lengths", defaultValue: "1000", guidance: "Метры: одно значение или столько же, сколько размеров ячеек; каждое целое 10–10000. Согласуйте допуск с точностью исходной геометрии." },
    generators,
  },
  calibrate_cerc: {
    cercCoefficients: { label: "Коэффициенты CERC", format: "coefficients", defaultValue: undefined, guidance: "1–8 безразмерных чисел через запятую, каждое больше 0 и не больше 1; дробная часть через точку, до 96 символов. Набор кандидатов задаётся по протоколу участка до оценки результата." },
  },
  seabed_render: { isobaths },
  seabed_validate: { isobaths: { ...isobaths, defaultValue: "20,200,1000,2000" } },
  seabed_check_full: { isobaths, generator: { ...generator, defaultValue: "frontal-quad" } },
  seabed_generate_adaptive: { generator },
  seabed_compare_adaptive: {
    levels: { label: "Уровни", format: "levels", defaultValue: "detailed:125:250", guidance: "1–4 уникальных id:min:max через запятую. ID: строчные латинские буквы, цифры, _ и -; начинается с буквы, до 32 символов. Целые размеры 10–10000 м, min < max. Начальный диапазон архивного эксперимента не является рекомендацией для любого участка." },
    generators: { ...generators, defaultValue: "delaunay,frontal-quad" },
    detailPreset: { label: "Географическое окно рисунка", format: "detailPreset", defaultValue: "none", allowedValues: ["none", "kizilirmak"], guidance: "none — без специального окна. kizilirmak выбирайте только для соответствующего участка. Географический пресет не подтверждает пригодность источника." },
  },
};

function validLength(value: string): boolean {
  return Number(value) >= 10 && Number(value) <= 10000;
}

/** Проверяет и нормализует списки/перечисления HTTP; расчётов не выполняет. */
export function resolveTextCalculationParameter(kind: CalculationKind, name: string, value: unknown): string {
  const definition = calculationTextParameters[kind]?.[name];
  if (!definition) throw new Error(`Не описан параметр «${name}»`);
  const resolved = value === undefined ? definition.defaultValue : value;
  if (typeof resolved !== "string") throw new Error(`Укажите «${definition.label}»: ${definition.guidance}`);
  switch (definition.format) {
    case "lengths":
      if (!/^[0-9]{1,5}(,[0-9]{1,5}){0,3}$/.test(resolved) || !resolved.split(",").every(validLength))
        throw new Error(`Недопустимый список «${definition.label}»: 1–4 целых значения 10–10000 м`);
      return resolved;
    case "generators":
    case "generator":
    case "detailPreset":
      if (!definition.allowedValues?.includes(resolved)) throw new Error(`Недопустимое значение «${definition.label}»`);
      return resolved;
    case "isobaths":
      if (!/^[0-9]{1,5}(\.[0-9]{1,3})?(,[0-9]{1,5}(\.[0-9]{1,3})?){0,15}$/.test(resolved) ||
        resolved.split(",").some((item) => Number(item) <= 0 || Number(item) > 10000))
        throw new Error("Изобаты: до 16 глубин больше 0 и не более 10000 м через запятую");
      return resolved;
    case "coefficients": {
      const items = resolved.split(",").map((item) => item.trim());
      if (resolved.length > 96 || items.length < 1 || items.length > 8 || items.some((item) =>
        !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(item) || !Number.isFinite(Number(item)) || Number(item) <= 0 || Number(item) > 1))
        throw new Error("Коэффициенты CERC должны содержать от одного до восьми чисел в диапазоне (0;1]");
      return items.join(",");
    }
    case "levels": {
      const levels = resolved.split(",");
      if (levels.length < 1 || levels.length > 4) throw new Error("Допустимо от одного до четырёх уровней");
      const ids = new Set<string>();
      for (const level of levels) {
        const parts = /^([a-z][a-z0-9_-]{0,31}):([0-9]{1,5}):([0-9]{1,5})$/.exec(level);
        if (!parts || ids.has(parts[1]) || !validLength(parts[2]) || !validLength(parts[3]) || Number(parts[2]) >= Number(parts[3]))
          throw new Error("Уровни: уникальные id:min:max, 10–10000 м и min < max");
        ids.add(parts[1]);
      }
      return resolved;
    }
  }
}
