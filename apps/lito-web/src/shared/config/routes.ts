export const BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const ROUTES = {
  home: "/",
  about: "/about",
  installation: "/installation",
  downloads: "/downloads",
  releases: "/releases",
  gallery: "/gallery",
  lab: "/lab",
  labCalculations: "/lab/calculations",
  labDatasets: "/lab/datasets",
  labShoreline: "/lab/shoreline",
  account: "/account",
  login: "/login",
} as const;

export const LAB_NAV_ITEMS = [
  { path: ROUTES.lab, label: "Обзор лаборатории", end: true },
  { path: ROUTES.labCalculations, label: "Расчёты и отчёты", end: false },
  { path: ROUTES.labDatasets, label: "Наборы данных", end: false },
  { path: ROUTES.labShoreline, label: "Динамика берега", end: false },
] as const;
