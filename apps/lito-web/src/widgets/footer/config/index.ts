export const FOOTER_LINKS = {
  project: [
    { label: "Лаборатория", href: "/lab" },
    { label: "О проекте", href: "/about" },
    { label: "Результаты", href: "/gallery" },
  ],
  resources: [
    {
      label: "Документация",
      href: "/docs",
    },
    { label: "Скачать CLI", href: "/downloads" },
    { label: "Установка CLI", href: "/installation" },
    { label: "История версий CLI", href: "/releases" },
    {
      label: "GitHub Issues",
      href: "https://github.com/Nickitas/litora/issues",
    },
  ],
  legal: [
    {
      label: "Лицензия MIT",
      href: "https://github.com/Nickitas/litora/blob/main/LICENSE",
    },
  ],
} as const;
