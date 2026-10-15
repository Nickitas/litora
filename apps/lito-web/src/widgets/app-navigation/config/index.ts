import { ROUTES } from "@/shared/config/routes";

export const NAV_ITEMS = [
  { path: ROUTES.about, label: "О проекте" },
  { path: ROUTES.gallery, label: "Результаты" },
  { path: "/docs", label: "Документация" },
  { path: ROUTES.downloads, label: "Скачать CLI" },
] as const;
