import { expect, test } from "@playwright/test";
import type {
  AuthDto,
  CalculationJobDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";

const id = "22222222-2222-4222-8222-222222222222";
const session = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "test@example.test",
    name: "Исследователь",
  },
  accessToken: "browser-test-token",
  expiresIn: 900,
} satisfies AuthDto;
const job = {
  id,
  kind: "erosion_file",
  status: "succeeded",
  input: {},
  inputSchemaVersion: 1,
  resultSummary: {},
  resultSchemaVersion: 1,
  coreVersion: "test",
  methodId: "cerc",
  methodRevision: "1",
  commandLine: null,
  errorMessage: null,
  createdAt: "2024-01-03T02:00:00Z",
  updatedAt: "2024-01-03T02:00:00Z",
  startedAt: "2024-01-03T01:00:00Z",
  finishedAt: "2024-01-03T02:00:00Z",
  artifacts: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      category: "output",
      filename: "erosion/visualization/index.json",
      contentType: "application/json",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      downloadUrl: "https://example.test/private",
    },
  ],
} satisfies CalculationJobDto;
const index = {
  schemaVersion: 1,
  mode: "calendar",
  scenarioStatus: "unclassified",
  usageLimitations: ["Требуется независимая проверка"],
  waveSource: "Архив волн",
  bathymetrySha256: "b".repeat(64),
  bathymetryStatus: "проверен",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  bounds: [39, 43, 39.03, 43.03],
  pointCount: 3,
  pointSeries: { groupSize: 10 },
  frames: [
    {
      index: 0,
      time: "2024-01-01T00:00:00Z",
      chunkId: "000001",
      durationHours: null,
      waveHeightM: null,
      erodedVolumeM3: null,
      depositedVolumeM3: null,
      balanceClosureResidualM3: null,
    },
    {
      index: 1,
      time: "2024-01-01T01:00:00Z",
      chunkId: "000001",
      durationHours: 1,
      waveHeightM: 1.5,
      erodedVolumeM3: 4,
      depositedVolumeM3: 1,
      balanceClosureResidualM3: 0,
    },
    {
      index: 2,
      time: "2024-01-03T01:00:00Z",
      chunkId: "000002",
      durationHours: 1,
      waveHeightM: 2,
      erodedVolumeM3: 6,
      depositedVolumeM3: 1,
      balanceClosureResidualM3: 0,
    },
  ],
} satisfies ShorelineVisualizationIndexDto;
const points = [
  { lat: 43, lon: 39 },
  { lat: 43.01, lon: 39.01 },
  { lat: 43.02, lon: 39.02 },
];
const chunks = {
  "000001": {
    schemaVersion: 1,
    id: "000001",
    frames: [
      { index: 0, points, cells: [] },
      { index: 1, points, cells: [{ pointIndex: 0, shorelineChangeM: -0.2 }] },
    ],
  },
  "000002": {
    schemaVersion: 1,
    id: "000002",
    frames: [
      { index: 2, points, cells: [{ pointIndex: 0, shorelineChangeM: -0.4 }] },
    ],
  },
} satisfies Record<string, ShorelineVisualizationChunkDto>;
const pointSeries = {
  schemaVersion: 1,
  pointIndex: 0,
  shorelineChangeM: [null, -0.2, -0.4],
};
const secondPointSeries = {
  schemaVersion: 1,
  pointIndex: 1,
  shorelineChangeM: [null, 0.3, null],
};
const emptyPointSeries = {
  schemaVersion: 1,
  pointIndex: 2,
  shorelineChangeM: [null, null, null],
};

test("пример открывается из обзора без своего расчёта и проигрывает сохранённые кадры", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/refresh") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(session) });
    } else if (path === "/api/calculations" || path === "/api/calculations/kinds") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await page.goto("/account");
  await page.getByRole("link", { name: "Открыть карту и реплей" }).click();
  await expect(page).toHaveURL(/\/account\/shoreline$/);
  await expect(page.getByRole("img", { name: /Карта: исходная линия/ })).toBeVisible();
  await expect(page.getByText("Короткий демонстрационный расчёт за 3 часа", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Воспроизвести/ }).click();
  await expect(page.getByRole("img", { name: /положение после шага 3/ })).toBeVisible();
  await page.getByRole("button", { name: "Предыдущий кадр" }).click();
  await page.getByRole("button", { name: "Предыдущий кадр" }).click();
  await expect(page.getByRole("row", { name: /Смещение ячейки за шаг/ })).toContainText(/0,0001455 м/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("карта показывает фактический кадр и не подставляет его в день без данных", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown;
      if (path === "/api/auth/refresh") body = session;
      else if (path === "/api/calculations") body = [job];
      else if (path === `/api/calculations/${id}`) body = job;
      else if (path === `/api/calculations/${id}/visualization`) body = index;
      else if (path.endsWith("/chunks/000001")) body = chunks["000001"];
      else if (path.endsWith("/chunks/000002")) body = chunks["000002"];
      else if (path.endsWith("/points/0/series")) body = pointSeries;
      else if (path.endsWith("/points/1/series")) body = secondPointSeries;
      else if (path.endsWith("/points/2/series")) body = emptyPointSeries;
      else {
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
  );
  await page.goto(`/account/shoreline?job=${id}`);
  await expect(
    page.getByRole("heading", { name: "Динамика берега" })
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Карта: исходная линия и положение после шага 2/,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Смещение узла 1 во времени" })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Точечный график смещения узла 1/ })
  ).toHaveAttribute("viewBox", /0 0 2\d\d 200/);
  await page.getByLabel("Узел береговой линии").fill("2");
  await expect(
    page.getByRole("heading", { name: "Смещение узла 2 во времени" })
  ).toBeVisible();
  await page.getByLabel("Узел береговой линии").fill("3");
  await expect(
    page.getByText("У узла 3 нет рассчитанного смещения", { exact: false })
  ).toBeVisible();
  await page.getByLabel("Узел береговой линии").fill("1");
  await expect(
    page.getByRole("heading", { name: "Смещение узла 1 во времени" })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Точечный график смещения узла 1/ })
  ).toHaveAttribute("viewBox", /0 0 2\d\d 200/);
  await page.getByRole("button", { name: "День", exact: true }).click();
  await page.getByLabel("Перейти к дате (UTC)").fill("2024-01-02");
  await expect(
    page.getByText("В этом периоде нет сохранённого состояния", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Карта: исходная линия/ })
  ).toHaveCount(0);
  await page.getByLabel("Перейти к дате (UTC)").fill("2024-01-01");
  await expect(
    page.getByRole("img", { name: /положение после шага 1/ })
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Смещение ячейки за шаг/ })
  ).toContainText(/[-−]0,2 м/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("ряд без временных меток показывает только шаги модели", async ({
  page,
}) => {
  const stepsIndex = {
    ...index,
    mode: "steps" as const,
    frames: index.frames.map((frame) => ({ ...frame, time: null })),
  } satisfies ShorelineVisualizationIndexDto;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown;
      if (path === "/api/auth/refresh") body = session;
      else if (path === "/api/calculations") body = [job];
      else if (path === `/api/calculations/${id}`) body = job;
      else if (path === `/api/calculations/${id}/visualization`)
        body = stepsIndex;
      else if (path.endsWith("/chunks/000001")) body = chunks["000001"];
      else if (path.endsWith("/chunks/000002")) body = chunks["000002"];
      else if (path.endsWith("/points/0/series")) body = pointSeries;
      else if (path.endsWith("/points/1/series")) body = secondPointSeries;
      else if (path.endsWith("/points/2/series")) body = emptyPointSeries;
      else {
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
  );
  await page.goto(`/account/shoreline?job=${id}`);
  await expect(
    page.getByText("У волнового ряда нет календарных меток", { exact: false })
  ).toBeVisible();
  await expect(page.getByLabel("Перейти к дате (UTC)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Год", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: /положение после шага 2/ })
  ).toBeVisible();
});
