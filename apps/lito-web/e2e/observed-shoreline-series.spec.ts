import { expect, test } from "@playwright/test";
import type { AuthDto, ObservedShorelineSeriesDto, ScientificInputDto } from "@litora/contracts";

const inputId = "22222222-2222-4222-8222-222222222222";
const session = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: "test@example.test", name: "Исследователь" },
  accessToken: "browser-test-token", expiresIn: 900,
} satisfies AuthDto;
const input = {
  id: inputId, name: "Сочи · снимки", role: "shoreline_timeseries_geojson",
  filename: "sochi.geojson", sizeBytes: 2048, source: "CoastSat", sourceRevision: "3.3",
  license: "GPL-3.0", crs: "EPSG:4326", coordinateUnit: "degrees",
  status: "ready", sha256: "a".repeat(64), createdAt: "2026-10-15T00:00:00Z",
} satisfies ScientificInputDto;
const series = {
  schemaVersion: 1,
  bounds: [39.7, 43.5, 39.8, 43.6],
  frames: [
    { time: "2020-01-01T00:00:00Z", satellite: "L8", geoAccuracy: 5, cloudCover: 0.1,
      coordinates: [[39.7, 43.5], [39.8, 43.6]] },
    { time: "2024-09-01T00:00:00Z", satellite: "S2", geoAccuracy: 1, cloudCover: 0.2,
      coordinates: [[39.71, 43.5], [39.79, 43.6]] },
  ],
} satisfies ObservedShorelineSeriesDto;

test("наблюдаемые контуры переключаются по датам без подмены расчётом CERC", async ({ page }) => {
  const auditId = "33333333-3333-4333-8333-333333333333";
  let auditCreated = false;
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/refresh")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(session) });
    if (path === "/api/scientific-inputs")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify([input]) });
    if (path === `/api/scientific-inputs/${inputId}/shoreline-series`)
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(series) });
    if (path === "/api/calculations/page") {
      const isAudit = new URL(route.request().url()).searchParams.get("kind") === "shoreline_data_audit";
      const items = isAudit && auditCreated ? [{ id: auditId, status: "succeeded", input: { observationsInputId: inputId, validationStart: "2024-01-01" } }] : [];
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items, nextCursor: null, totalCount: items.length }) });
    }
    if (path === "/api/calculations" && route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ kind: "shoreline_data_audit", input: { observationsInputId: inputId, validationStart: "2024-01-01" } });
      auditCreated = true;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: auditId, status: "queued" }) });
    }
    if (path === `/api/calculations/${auditId}`) return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: auditId, status: "succeeded", input: { observationsInputId: inputId, validationStart: "2024-01-01" }, resultSummary: { metrics: { "shoreline-data-audit.json": {
        schemaVersion: 3, observationCount: 2, firstObservation: "2020-01-01T00:00:00Z",
        lastObservation: "2024-09-01T00:00:00Z", longestObservationGapDays: 1705,
        temporalSplit: { validationStart: "2024-01-01T00:00:00Z", trainingCount: 1, validationCount: 1,
          trainingLastTime: "2020-01-01T00:00:00Z", validationFirstTime: "2024-09-01T00:00:00Z", boundaryGapDays: 1705 },
        years: [{ year: 2020, count: 1 }, { year: 2021, count: 0 }, { year: 2024, count: 1 }],
        pilotCoverage: { bounds: [39.667927, 43.585476, 39.7129247, 43.6442458],
          intersectingCount: 1, outsideCount: 1, unknownGeometryCount: 0,
          years: [{ year: 2020, count: 1 }, { year: 2021, count: 0 }, { year: 2024, count: 0 }] },
        missingUncertaintyCount: 2, missingGeoAccuracyCount: 0,
        unknownTideStatusCount: 2, limitations: ["Недостаточно данных для прогноза"], waves: null,
      } } },
    }) });
    return route.abort("blockedbyclient");
  });
  await page.goto("/lab/shoreline");
  const observations = page.getByRole("region", { name: "Спутниковые наблюдения" });
  await expect(observations.getByText("Снимок 2 из 2", { exact: false })).toBeVisible();
  await expect(observations.getByText("Географическая подложка недоступна", { exact: false })).toBeVisible();
  const map = observations.getByRole("img", { name: "Сравнение первого и выбранного наблюдений береговой линии" });
  const latest = await map.locator("path").last().getAttribute("d");
  const years = observations.getByRole("group", { name: "Перейти к году: охват наблюдений по годам" });
  await expect(years.getByRole("button", { name: "2021: 0 дат" })).toBeDisabled();
  await years.getByRole("button", { name: "2020: 1 дат" }).click();
  await expect(observations.getByText("Снимок 1 из 2", { exact: false })).toBeVisible();
  await years.getByRole("button", { name: "2024: 1 дат" }).click();
  await expect(observations.getByText("Снимок 2 из 2", { exact: false })).toBeVisible();
  await observations.getByRole("button", { name: "Предыдущий снимок" }).click();
  await expect(observations.getByText("Снимок 1 из 2", { exact: false })).toBeVisible();
  expect(await map.locator("path").last().getAttribute("d")).not.toBe(latest);
  await observations.getByRole("combobox", { name: "Масштаб времени" }).click();
  await page.getByRole("option", { name: "День" }).click();
  await expect(observations.getByText("снимков: 1", { exact: false })).toBeVisible();
  await observations.getByLabel("Начало отложенной проверки UTC (необязательно)").fill("2024-01-01");
  await observations.getByRole("button", { name: "Проверить данные" }).click();
  await expect(observations.getByText("Аудит: в очереди", { exact: false })).toBeVisible();
  await expect(observations.getByText("Годы без снимков")).toBeVisible({ timeout: 8000 });
  await expect(observations.getByRole("definition").filter({ hasText: "2021" })).toBeVisible();
  await expect(observations.getByText("Временное разделение для будущей проверки модели")).toBeVisible();
  await expect(observations.getByText("Покрытие пилотного участка Сочи")).toBeVisible();
  await expect(observations.getByText("Пересекают стартовую рамку: 1 из 2 контуров", { exact: false })).toBeVisible();
  await page.reload();
  await expect(observations.getByText("Годы без снимков")).toBeVisible();
  await expect(observations.getByLabel("Начало отложенной проверки UTC (необязательно)")).toHaveValue("2024-01-01");
});
