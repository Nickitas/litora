import type { CalculationKind } from "@litora/contracts";

interface ScenarioGuidance {
  source: string;
  limitation: string;
  reference: { label: string; href: string };
}

export const scenarioGuidance = {
  dimension: {
    source:
      "Поставляемая обзорная линия Чёрного моря; свой контур здесь не используется.",
    limitation:
      "Оценка зависит от детализации линии и диапазона масштабов. Это не измерение конкретного участка берега.",
    reference: {
      label: "Как интерпретировать размерность",
      href: "/docs/reference/fractal-analysis-scope.md",
    },
  },
  dimension_dataset: {
    source:
      "Ваш GeoJSON LineString или встроенный пример участка Сочи. Источник и лицензия своего набора указаны вами.",
    limitation:
      "Загрузка не подтверждает научную пригодность линии: геометрию проверит Go при запуске, а оценка зависит от качества и разрешения исходных данных.",
    reference: {
      label: "О данных береговой линии",
      href: "/docs/reference/coastline-source-selection.md",
    },
  },
  map: {
    source:
      "Поставляемая обзорная схема Чёрного моря и локальный участок Сочи.",
    limitation:
      "Карта нужна для ориентира. Схема не заменяет точный контур, съёмку или проектный план.",
    reference: {
      label: "Об обзорной карте",
      href: "/docs/reference/black-sea-map.md",
    },
  },
  erosion: {
    source:
      "Закреплённые волновые и батиметрические данные демонстрационного участка Сочи; кабинет запускает расчёт без обновления данных из сети.",
    limitation:
      "Демонстрация CERC, а не прогноз годового размыва или основание для инженерного решения.",
    reference: {
      label: "О модели CERC и её ограничениях",
      href: "/docs/reference/cerc-one-line-model.md",
    },
  },
} satisfies Record<CalculationKind, ScenarioGuidance>;
