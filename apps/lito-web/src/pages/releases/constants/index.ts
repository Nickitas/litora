export interface AppRelease {
  version: string;
  releaseDate?: string;
  description?: string;
  /** Ссылка на GitHub Release. null — релиз ещё не опубликован */
  releaseUrl: string | null;
  downloadUrl?: string;
  isLatest?: boolean;
}

export const releasesPageContent = {
  hero: {
    title: "Версии Litora CLI",
    subtitle: "История версий и доступные сборки",
    description:
      "Сборки v2.0 доступны на сайте. Исторические релизы будут опубликованы в монорепозитории после проверки архивных файлов.",
  },

  repoSection: {
    badge: "GitHub Releases",
    title: "Официальный репозиторий",
    description:
      "Исходный код развивается в монорепозитории Litora. Релизы прежнего репозитория сейчас недоступны; архивные версии восстанавливаются отдельно.",
    buttonText: "Открыть репозиторий",
  },

  githubRepo: {
    name: "litora",
    owner: "Nickitas",
    baseUrl: "https://github.com/Nickitas/litora",
  },

  unavailableLabel: "Архив пока недоступен",
  availableLabel: "Доступно для скачивания",

  releases: [
    {
      version: "v2.0",
      releaseDate: "30 августа 2026",
      description:
        "Цельный научный контур для Чёрного моря: береговая линия, батиметрия, адаптивные четырёхугольные сетки Gmsh, 3D-рельеф, профили и воспроизводимые метрики",
      releaseUrl: null,
      downloadUrl: "/downloads",
      isLatest: true,
    },
    {
      version: "v1.2",
      releaseDate: "20 июня 2025",
      description:
        "Комплексная физическая модель эрозии: волновая эрозия, транспорт наносов, литология, временная динамика, климатические сценарии, CSV экспорт",
      releaseUrl: null,
    },
    {
      version: "v1.0.0",
      releaseDate: "15 января 2025",
      description: "Фрактальная геометрия и парадокс береговой линии",
      releaseUrl: null,
    },
  ] satisfies AppRelease[],
} as const;
