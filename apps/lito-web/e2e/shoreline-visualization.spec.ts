import { expect, test, type Page } from "@playwright/test";
import type {
  AuthDto,
  CalculationJobDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
} from "@litora/contracts";

test.beforeEach(async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
});

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

async function chooseCalendarDate(page: Page, value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString("ru-RU");
  await page.getByRole("button", { name: /Перейти к дате \(UTC\)/ }).click();
  await page.locator(`[data-day="${dateLabel}"]`).click();
}
const emptyPointSeries = {
  schemaVersion: 1,
  pointIndex: 2,
  shorelineChangeM: [null, null, null],
};

test("пример открывается из обзора без своего расчёта и проигрывает сохранённые кадры", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem("fraes-theme", "dark"));
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/refresh") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(session) });
    } else if (path === "/api/calculations" || path === "/api/calculations/kinds") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
    } else if (path === "/api/calculations/page") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], nextCursor: null, totalCount: 0 }) });
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await page.goto("/lab");
  await page.getByRole("link", { name: "Открыть карту и реплей" }).click();
  await expect(page).toHaveURL(/\/lab\/shoreline$/);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("img", { name: /Карта: исходная линия/ })).toBeVisible();
  await expect(page.getByText("Демонстрационный расчёт за 7 суток", { exact: false })).toBeVisible();
  await expect(page.getByRole("group", { name: "Перейти к году: охват расчётных состояний по годам" })
    .getByRole("button", { name: "2026: 169 дат" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Данные для карты" })).toBeVisible();
  await page.getByRole("combobox", { name: "Скорость" }).click();
  await page.getByRole("option", { name: "2×" }).click();
  await page.getByRole("button", { name: /Воспроизвести/ }).click();
  await expect(page.getByRole("img", { name: /положение после шага 24/ })).toBeVisible();
  await page.getByRole("button", { name: "Пауза" }).click();
  const slider = page.getByRole("region", { name: "Реплей береговой линии" })
    .getByRole("slider", { name: "Состояние береговой линии" });
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(page.getByRole("img", { name: /положение после шага 3/ })).toBeVisible();
  const map = page.locator('svg[aria-label^="Карта:"]');
  await expect(map).toHaveAttribute("viewBox", "0 0 800 1500");
  await expect(map.locator('[data-map-grid="local"]')).toHaveAttribute("d", /V1500.*H800/);
  await expect(page.getByRole("combobox", { name: "Усиление смещения" })).toHaveCount(0);
  await expect(map.locator("[data-display-contour]")).toHaveCount(0);
  await slider.press("End");
  await expect(page.getByRole("img", { name: /положение после шага 168/ })).toBeVisible();
  await page.getByLabel("Узел береговой линии").fill("13");
  const connectorLength = () => map.evaluate((svg) => {
    const line = svg.querySelector<SVGLineElement>('[data-selected-displacement="actual"] line');
    if (!line) return 0;
    const matrix = line.getScreenCTM();
    if (!matrix) return 0;
    const start = new DOMPoint(Number(line.getAttribute("x1")), Number(line.getAttribute("y1"))).matrixTransform(matrix);
    const end = new DOMPoint(Number(line.getAttribute("x2")), Number(line.getAttribute("y2"))).matrixTransform(matrix);
    return Math.hypot(
      end.x - start.x,
      end.y - start.y,
    );
  });
  const overviewLength = await connectorLength();
  expect(overviewLength).toBeLessThan(0.01);
  await expect(map.locator('[data-actual-contour="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Крупный план узла" }).click();
  await expect.poll(connectorLength).toBeGreaterThan(overviewLength * 10);
  await expect(page.getByText("Крупный план сохраняет положение камеры", { exact: false })).toBeVisible();
  const camera = () => map.evaluate((svg) => {
    const line = svg.querySelector<SVGLineElement>('[data-selected-displacement="actual"] line');
    const matrix = line?.getCTM();
    if (!line || !matrix) return null;
    const point = new DOMPoint(Number(line.getAttribute("x1")), Number(line.getAttribute("y1"))).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  const fixedPoint = await camera();
  await slider.press("ArrowLeft");
  await expect(page.getByRole("img", { name: /положение после шага 167/ })).toBeVisible();
  expect(await camera()).toEqual(fixedPoint);
  await slider.press("End");
  await expect(page.getByRole("img", { name: /положение после шага 168/ })).toBeVisible();
  await page.getByRole("button", { name: "Весь участок" }).click();
  await expect.poll(connectorLength).toBeLessThan(0.01);
  await slider.press("Home");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(page.getByRole("img", { name: /положение после шага 3/ })).toBeVisible();
  await page.getByLabel("Узел береговой линии").fill("1");
  await page.getByRole("button", { name: "Смещения по узлам" }).click();
  await expect(map.locator('[data-change-kind="landward"]').first()).toBeVisible();
  await expect(map.locator('[data-change-kind="seaward"]').first()).toBeVisible();
  await expect(page.getByRole("paragraph").filter({ hasText: "Узел 1: смещение к суше" })).toBeVisible();
  await page.getByRole("button", { name: "Смещения по узлам" }).click();
  await expect(map.locator("[data-change-kind]")).toHaveCount(0);
  await page.getByRole("button", { name: "Смещения по узлам" }).click();
  await expect(map.locator('[data-change-kind="landward"]').first()).toBeVisible();
  const stableMap = await map.elementHandle();
  const mapSize = await map.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  await page.getByRole("button", { name: "Предыдущий кадр" }).click();
  await page.getByRole("button", { name: "Предыдущий кадр" }).click();
  await expect(page.getByRole("img", { name: /положение после шага 1/ })).toBeVisible();
  expect(await stableMap?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.getByRole("img", { name: /положение после шага 1/ })
    .evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }))).toEqual(mapSize);
  await expect(slider).toBeVisible();
  await slider.focus();
  await slider.press("Home");
  await expect(page.getByRole("img", { name: /Карта: исходная линия/ })).toBeVisible();
  await slider.press("End");
  await expect(page.getByRole("img", { name: /положение после шага 168/ })).toBeVisible();
  await expect(page.getByText("Кадр 169 из 169")).toBeVisible();
  await slider.press("ArrowLeft");
  await slider.press("ArrowLeft");
  await expect(page.getByRole("img", { name: /положение после шага 166/ })).toBeVisible();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await page.getByRole("button", { name: "Следующий узел" }).click();
  await expect(page.getByRole("heading", { name: "Смещение узла 2 во времени" })).toBeVisible();
  await page.getByRole("button", { name: "Предыдущий узел" }).click();
  await expect(page.getByRole("row", { name: /Смещение ячейки за шаг/ })).toContainText(/0,0001455 м/);
  await slider.press("Home");
  await page.getByRole("combobox", { name: "Шаг просмотра" }).click();
  await page.getByRole("option", { name: "Каждый час" }).click();
  await page.getByRole("combobox", { name: "Скорость" }).click();
  await page.getByRole("option", { name: "0,5×" }).click();
  await page.getByRole("button", { name: /Воспроизвести/ }).click();
  await expect(page.getByRole("img", { name: /положение после шага 1/ })).toBeVisible();
  await page.getByRole("button", { name: "Пауза" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("селектор фильтрует сценарии и открывает карту со следующей страницы", async ({ page }) => {
  const olderId = "44444444-4444-4444-8444-444444444444";
  const older = {
    ...job,
    id: olderId,
    kind: "all_file" as const,
    createdAt: "2023-12-01T02:00:00Z",
  };
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown;
    if (path === "/api/auth/refresh") body = session;
    else if (path === "/api/calculations/page") {
      if (url.searchParams.get("kind") === "erosion_file")
        body = { items: [job], nextCursor: null, totalCount: 1 };
      else if (url.searchParams.get("cursor"))
        body = { items: [older], nextCursor: null, totalCount: 2 };
      else body = { items: [job], nextCursor: "next-page", totalCount: 2 };
    } else if (path === `/api/calculations/${olderId}`) body = older;
    else if (path === `/api/calculations/${olderId}/visualization`) body = index;
    else if (path.endsWith("/chunks/000001")) body = chunks["000001"];
    else if (path.endsWith("/chunks/000002")) body = chunks["000002"];
    else if (path.endsWith("/points/0/series")) body = pointSeries;
    else {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/lab/shoreline");
  await expect(page.getByText("Загружено карт: 1 из 2")).toBeVisible();
  await page.getByRole("combobox", { name: "Сценарий карты" }).click();
  await page.getByRole("option", { name: "Эрозия · свои данные" }).click();
  await expect(page.getByText("Загружено карт: 1 из 1")).toBeVisible();
  await page.getByRole("combobox", { name: "Сценарий карты" }).click();
  await page.getByRole("option", { name: "Все сценарии CERC" }).click();
  await page.getByRole("button", { name: "Показать ещё карты" }).click();
  await expect(page.getByText("Загружено карт: 2 из 2")).toBeVisible();
  await page.getByRole("combobox", { name: "Данные для карты" }).click();
  await page.getByRole("option", { name: /44444444/ }).click();
  await expect(page).toHaveURL(new RegExp(`job=${olderId}`));
  const map = page.getByRole("img", { name: /положение после шага 2/ });
  await expect(map).toBeVisible();
  await expect(map.locator('[data-map-grid="local"]')).toHaveAttribute("d", /[ML]/);
  await expect(map.locator('[data-selected-displacement="actual"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Исходный контур" }).click();
  await expect(map.locator('[data-selected-displacement="actual"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Координатная сетка" }).click();
  await expect(map.locator('[data-map-grid="local"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Координатная сетка" })).toHaveAttribute("aria-pressed", "false");
});

test("загрузка соседнего chunk сохраняет положение карты", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const delayedIndex: ShorelineVisualizationIndexDto = {
    ...index,
    frames: [...index.frames, {
      ...index.frames[2], index: 3, time: "2024-01-04T01:00:00Z", chunkId: "000003",
    }],
  };
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === "/api/auth/refresh") body = session;
    else if (path === "/api/scientific-inputs") body = [];
    else if (path === "/api/calculations/page") body = { items: [job], nextCursor: null, totalCount: 1 };
    else if (path === `/api/calculations/${id}`) body = job;
    else if (path === `/api/calculations/${id}/visualization`) body = delayedIndex;
    else if (path.endsWith("/chunks/000001")) body = chunks["000001"];
    else if (path.endsWith("/chunks/000002")) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      body = chunks["000002"];
    } else if (path.endsWith("/chunks/000003")) body = {
      schemaVersion: 1, id: "000003", frames: [{ index: 3, points, cells: [] }],
    };
    else if (path.endsWith("/points/0/series")) body = {
      ...pointSeries, shorelineChangeM: [null, -0.2, -0.4, null],
    };
    else return route.abort("blockedbyclient");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/lab/shoreline?job=${id}`);
  const map = page.getByRole("img", { name: /положение после шага 3/ });
  await expect(map).toBeVisible();
  const mapPanel = page.getByRole("region", { name: "Реплей береговой линии" });
  const chartPanel = page.getByRole("region", { name: "Графики реплея" });
  await expect(chartPanel.getByRole("heading", { name: "Смещение узла 1 во времени" })).toBeVisible();
  const mapPanelBox = await mapPanel.boundingBox();
  const chartPanelBox = await chartPanel.boundingBox();
  expect(mapPanelBox).not.toBeNull();
  expect(chartPanelBox).not.toBeNull();
  expect(chartPanelBox!.x).toBeGreaterThan(mapPanelBox!.x + mapPanelBox!.width - 1);
  expect(Math.abs(chartPanelBox!.y - mapPanelBox!.y)).toBeLessThan(2);
  await expect(map).toHaveAttribute("viewBox", "0 0 800 440");
  const stableMap = await map.elementHandle();
  await page.getByRole("button", { name: "Предыдущий кадр" }).click();
  await expect(page.getByText("пока показан предыдущий контур", { exact: false })).toBeVisible();
  await expect(chartPanel.getByRole("img", { name: /Выбран шаг 3/ })).toBeVisible();
  expect(await stableMap?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.getByRole("img", { name: /положение после шага 2/ })).toBeVisible();
  expect(await stableMap?.evaluate((element) => element.isConnected)).toBe(true);
  expect((await mapPanel.boundingBox())?.width).toBe(mapPanelBox!.width);
  await expect(chartPanel.getByRole("img", { name: /Выбран шаг 2/ })).toBeVisible();
  await expect(chartPanel.getByText("-0,4 м", { exact: true })).toBeVisible();
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
      else if (path === "/api/calculations/page") body = { items: [job], nextCursor: null, totalCount: 1 };
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
  await page.goto(`/lab/shoreline?job=${id}`);
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
  const mapPanelBox = await page.getByRole("region", { name: "Реплей береговой линии" }).boundingBox();
  const chartPanelBox = await page.getByRole("region", { name: "Графики реплея" }).boundingBox();
  expect(mapPanelBox).not.toBeNull();
  expect(chartPanelBox).not.toBeNull();
  expect(chartPanelBox!.y).toBeGreaterThan(mapPanelBox!.y);
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
  await chooseCalendarDate(page, "2024-01-02");
  await expect(
    page.getByText("В этом периоде нет сохранённого состояния", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Карта: исходная линия/ })
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Позже: Шаг 2/ }).click();
  await expect(
    page.getByRole("img", { name: /положение после шага 2/ })
  ).toBeVisible();
  await chooseCalendarDate(page, "2024-01-02");
  await page.getByRole("button", { name: /Раньше: Шаг 1/ }).click();
  await expect(
    page.getByRole("img", { name: /положение после шага 1/ })
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Смещение ячейки за шаг/ })
  ).toContainText(/[-−]0,2 м/);
  await page.getByRole("combobox", { name: "Данные для карты" }).click();
  await page.getByRole("option", { name: /Пример Сочи/ }).click();
  await expect(page).toHaveURL(/\/lab\/shoreline$/);
  await expect(page.getByRole("img", { name: /Карта: исходная линия/ })).toBeVisible();
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
      else if (path === "/api/calculations/page") body = { items: [job], nextCursor: null, totalCount: 1 };
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
  await page.goto(`/lab/shoreline?job=${id}`);
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
