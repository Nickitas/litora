import type { CalculationKind } from "@litora/contracts";

interface ScenarioGuidance {
  source: string;
  limitation: string;
  reference: { label: string; href: string };
}

export const scenarioGuidance = {
  source_file: {
    source: "Загруженный GeoJSON-контур с заявленным вами источником и лицензией.",
    limitation: "Проверка структуры и снимок файла не удостоверяют геодезическую точность или право публикации данных.",
    reference: { label: "О выборе источника контура", href: "/docs/reference/coastline-source-selection.md" },
  },
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
  dimension_file: {
    source: "Загруженный GeoJSON полного контура с вашим паспортом источника и лицензии.",
    limitation: "Размерность зависит от разрешения и качества контура. Совпадение с рисунками статьи требует тех же входных SHA-256 и версии ядра.",
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
  map_file: {
    source: "Ваш GeoJSON-контур Чёрного моря; участок Сочи отображается из поставляемых данных.",
    limitation: "Обзорная карта не предназначена для проектных решений; корректность контура и права использования нужно подтвердить отдельно.",
    reference: { label: "Об обзорной карте", href: "/docs/reference/black-sea-map.md" },
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
  mesh: {
    source: "Ваш полный GeoJSON-контур моря; Gmsh строит новую плоскую сетку.",
    limitation: "Входной контур, версия Gmsh и параметры влияют на ячейки. Большие сетки требуют выделенного worker и свободного диска.",
    reference: { label: "О расчётной сетке", href: "/docs/reference/seabed-scientific-guide.md" },
  },
  seabed_build: {
    source: "Плоская MSH, проверенный JSON батиметрии, его паспорт и тот же полный контур моря.",
    limitation: "Go сверяет паспорт и совместимость данных. Результат — новая модель дна; карты строятся отдельным сценарием.",
    reference: { label: "О батиметрических моделях", href: "/docs/reference/seabed-scientific-guide.md" },
  },
  seabed_render: {
    source: "Принятая модель дна MSH, паспорт экспорта и паспорт батиметрического источника.",
    limitation: "Визуализация не пересчитывает глубины. CRS и вертикальная система должны совпадать с паспортом модели.",
    reference: {
      label: "О батиметрических моделях",
      href: "/docs/reference/seabed-scientific-guide.md",
    },
  },
  seabed_adapt: {
    source: "Принятая модель дна MSH и паспорт батиметрического источника.",
    limitation: "Поле размера ещё не является новой сеткой; фактические ячейки создаёт отдельный расчёт Gmsh.",
    reference: {
      label: "О батиметрических моделях",
      href: "/docs/reference/seabed-scientific-guide.md",
    },
  },
  seabed_generate_adaptive: {
    source: "Принятая модель дна, паспорт экспорта, поле размера CSV/JSON и полный контур моря.",
    limitation: "Gmsh строит одну фактическую сетку; качество и ресурсная потребность зависят от поля и контура.",
    reference: { label: "Об адаптивной сетке", href: "/docs/reference/seabed-scientific-guide.md" },
  },
  seabed_validate: {
    source: "Проверяемая и независимая опорная модели дна с паспортами, паспорт неопределённости и поле размера.",
    limitation: "Межпродуктовый контроль не равен независимой научной аттестации; вывод зависит от разрешения и вертикальной неопределённости эталона.",
    reference: { label: "О проверке рельефа", href: "/docs/reference/seabed-scientific-guide.md" },
  },
  seabed_compare_adaptive: {
    source: "Модель дна, паспорт экспорта, CSV/JSON поля ADAPT-01 и полный GeoJSON-контур.",
    limitation: "Расчёт может занять часы и создать несколько гигабайт MSH. Запуск требует выделенного worker с Gmsh.",
    reference: {
      label: "О батиметрических моделях",
      href: "/docs/reference/seabed-scientific-guide.md",
    },
  },
} satisfies Record<CalculationKind, ScenarioGuidance>;
