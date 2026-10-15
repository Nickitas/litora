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
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/refresh")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(session) });
    if (path === "/api/scientific-inputs")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify([input]) });
    if (path === `/api/scientific-inputs/${inputId}/shoreline-series`)
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(series) });
    if (path === "/api/calculations/page")
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], nextCursor: null, totalCount: 0 }) });
    return route.abort("blockedbyclient");
  });
  await page.goto("/lab/shoreline");
  const observations = page.getByRole("region", { name: "Спутниковые наблюдения" });
  await expect(observations.getByText("Снимок 2 из 2", { exact: false })).toBeVisible();
  await expect(observations.getByText("Географическая подложка недоступна", { exact: false })).toBeVisible();
  const map = observations.getByRole("img", { name: "Сравнение первого и выбранного наблюдений береговой линии" });
  const latest = await map.locator("path").last().getAttribute("d");
  await observations.getByRole("button", { name: "Предыдущий снимок" }).click();
  await expect(observations.getByText("Снимок 1 из 2", { exact: false })).toBeVisible();
  expect(await map.locator("path").last().getAttribute("d")).not.toBe(latest);
  await observations.getByRole("combobox", { name: "Масштаб времени" }).click();
  await page.getByRole("option", { name: "День" }).click();
  await expect(observations.getByText("снимков: 1", { exact: false })).toBeVisible();
});
