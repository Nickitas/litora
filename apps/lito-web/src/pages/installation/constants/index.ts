export interface CliCommand {
  command: string;
  description: string;
}

export const installationPageContent = {
  hero: {
    title: "Установка Litora-CLI v2.0",
    subtitle: "Простая установка на все основные платформы",
  },

  fromSource: {
    title: "Из исходников",
    steps: [
      {
        title: "1. Клонирование репозитория",
        code: "git clone https://github.com/Nickitas/litora.git\ncd litora/apps/lito-cli",
        note: "",
      },
      {
        title: "2. Сборка",
        code: "go build -o lito ./cmd/lito",
        note: "Или через Makefile: make build",
      },
      {
        title: "3. Запуск",
        code: "./lito --help",
        note: "",
      },
    ],
  },

  basicCommands: {
    title: "Базовые команды",
    commands: [
      {
        title: "Валидация и метрики загруженной береговой линии",
        code: "./lito source",
      },
      {
        title: "Полный сценарий (все этапы)",
        code: "./lito all --input data/coast-segment.geojson --wave-input data/waves.csv --bathymetry data/bathymetry.json",
      },
      {
        title: "Геоморфологическое моделирование эрозии",
        code: "./lito erosion --input data/coast-segment.geojson --wave-input data/waves.csv --bathymetry data/bathymetry.json",
      },
    ],
  },

  cliCommands: [
    {
      command: "./lito source --input data/coastline/black-sea.geojson",
      description: "Проверка реального сохранённого контура и его происхождения",
    },
    {
      command: "./lito dimension --input data/coastline/black-sea.geojson",
      description: "Box-counting полного закреплённого контура MarineRegions",
    },
    {
      command: "./lito map black-sea --input data/coastline/black-sea.geojson",
      description: "Обзорная карта сохранённого контура Чёрного моря",
    },
    {
      command: "./lito erosion --input data/coast-segment.geojson --wave-input data/waves.csv --wave-source 'Источник и период волн' --bathymetry data/bathymetry.json",
      description: "CERC по вашим файлам участка; замените пути своими, подготовьте паспорт батиметрии",
    },
    {
      command: "./lito erosion --input data/coast-segment.geojson --wave-input data/waves.csv --bathymetry data/bathymetry.json --steps 0 --svg-max-frames 64 --output-csv erosion.csv",
      description: "Расчёт всего заданного волнового ряда с ограничением числа SVG и экспортом CSV",
    },
    {
      command: "./lito all --input data/coast-segment.geojson --wave-input data/waves.csv --bathymetry data/bathymetry.json --output output/research",
      description: "Проверка, размерность и CERC по явно выбранным файлам; научная аттестация не выполняется автоматически",
    },
  ] as CliCommand[],

  systemRequirements: {
    title: "Системные требования",
    requirements: [
      {
        label: "Go",
        detail: "версия 1.23 или выше (для сборки из исходников)",
      },
      {
        label: "ОС",
        detail: "Windows 10+, macOS 11+, Linux (Ubuntu 20.04+, Debian 11+)",
      },
      { label: "Память", detail: "минимум 512 MB RAM" },
      { label: "Диск", detail: "около 100 MB для бинарных файлов и данных" },
    ],
  },

  helpSection: {
    title: "Нужна помощь?",
    description:
      "Полную документацию и примеры использования смотрите в README на GitHub или в issue tracker для вопросов и обсуждений.",
    ctaButton: "Скачать Litora CLI",
  },
} as const;
