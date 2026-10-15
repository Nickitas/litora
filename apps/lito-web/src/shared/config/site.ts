import releaseManifest from "./releases.json";

const VERSION =
  import.meta.env.VITE_CLI_VERSION_NUMBER || releaseManifest.version;

export const SITE_CONFIG = {
  name: "Litora",
  fullName: "Litora",
  description:
    "Исследовательская лаборатория береговой линии, рельефа дна и прибрежных процессов Чёрного моря",
  repository: releaseManifest.repository,
  version: VERSION,
  releaseDate: "2026-08-30",
} as const;

export const SOCIAL_LINKS = [
  {
    name: "GitHub",
    url: "https://github.com/Nickitas/litora",
    icon: "📦",
  },
] as const;
