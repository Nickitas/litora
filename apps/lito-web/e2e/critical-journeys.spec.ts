import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createApiClient } from "@litora/api-client";
import type {
  AuthDto,
  CalculationJobDto,
  CalculationKindDto,
  CoastlinePreviewDto,
  CoastlineValidationDto,
  CalculationDeletionRequestDto,
  CalculationMetadataExportV1,
  DatasetDto,
  DatasetDetailDto,
  ReusableScientificArtifactDto,
  ScientificInputDto,
  ScientificInputQuotaDto,
  ScientificInputRole,
} from "@litora/contracts";
import {
  adaptiveParameterDefinitions,
  allFileDefaults,
  cercCalibrationDefaults,
  cercSiteParameterNames,
  erosionDemoDefaults,
  erosionFileDefaults,
} from "@litora/contracts";
import {
  coastlineExamples,
  defaultCoastlineDataset,
  defaultCoastlineExample,
  findSavedExample,
} from "@litora/generated-data";
import { suggestDatasetName } from "../src/pages/account/model/dataset-name";
import { findSavedResearchDataset, parseResearchDataset, researchCatalogue } from "@litora/generated-data/research";

// Выбранные значения транспортных тестов, не рекомендации для участка.
async function fillCercSiteParameters(page: Page, prefix = "erosion") {
  for (const field of cercSiteParameterNames) {
    if (prefix === "calibration" && field === "cercCoefficient") continue;
    await page.locator(`#${prefix}-${field}`).fill(String(erosionFileDefaults[field]));
  }
}

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "browser@example.test",
  name: "Тестовый исследователь",
};

for (const theme of ["light", "dark"] as const) {
  test(`параметры участка CERC остаются пустыми до явного ввода · ${theme}`, async ({ page }) => {
    const roles = ["coastline_geojson", "wave_climate", "bathymetry_grid_json", "bathymetry_grid_metadata_json"] as const;
    const fields = ["coastlineInputId", "waveInputId", "bathymetryInputId", "bathymetryMetadataInputId"] as const;
    const inputs = roles.map((role, index) => ({ ...articleInputs[0], role,
      id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`, name: `Участок ${index + 1}` }));
    let posts = 0;
    const observed = await mockApi(page, (path, method) => {
      if (path === "/api/auth/refresh") return { body: session };
      if (path === "/api/calculations/kinds") return { body: kinds };
      if (path === "/api/scientific-inputs") return { body: inputs };
      if (path === "/api/datasets") return { body: [] };
      if (path === "/api/calculations") { if (method === "POST") posts++; return { body: [] }; }
    });
    await page.setViewportSize({ width: 360, height: 780 });
    await openNewCalculation(page, theme);
    await chooseOption(page, "Что рассчитать", "Эрозия по своим данным");
    const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
    for (const field of cercSiteParameterNames) {
      const input = dialog.locator(`#erosion-${field}`);
      await expect(input).toBeEmpty();
      await expect(input).toHaveAttribute("aria-describedby", `erosion-${field}-hint`);
      await expect(dialog.locator(`#erosion-${field}-hint`)).toContainText("Технический диапазон");
    }
    for (const [index, field] of fields.entries()) {
      await dialog.locator(`#scientific-${field}`).click();
      await page.getByRole("option", { name: new RegExp(`Участок ${index + 1}`) }).click();
    }
    await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
    await fillCercSiteParameters(page);
    await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeEnabled();
    const left = dialog.locator("#erosion-leftBoundaryTransport");
    await expect(left).toHaveValue("0");
    await left.fill("");
    await expect(left).toBeEmpty();
    await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
    await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Поток через левую границу");
    await left.fill("0");
    await dialog.locator("#erosion-bermHeight").fill("101");
    await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
    await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("0.001…100");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await dialog.locator("#erosion-bermHeight").scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Закрыть окно нового расчёта" })).toBeInViewport();
    expect(await dialog.locator("footer").evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(200);
    await page.screenshot({ path: `/private/tmp/litora-0075-${theme}-parameters.png` });
    expect(posts).toBe(0);
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}
const session = {
  user,
  accessToken: "browser-test-token",
  expiresIn: 900,
} satisfies AuthDto;

test("предел шага батиметрии и начальные настройки адаптации берутся из общего контракта", async ({ page }) => {
  const observed = await mockApi(page, (path) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations/kinds") return { body: [
      { kind: "calibrate_cerc", title: "Калибровка CERC", description: "Тест" },
      { kind: "seabed_adapt", title: "Поле размера", description: "Тест" },
    ] };
    if (["/api/datasets", "/api/scientific-inputs", "/api/calculations"].includes(path)) return { body: [] };
  });
  await openNewCalculation(page, "light");
  await chooseOption(page, "Что рассчитать", "Калибровка CERC");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.locator("#calibration-resolution")).toBeEmpty();
  await expect(dialog.locator("#calibration-resolution")).toHaveAttribute("max", "0.1");
  await expect(dialog.locator("#calibration-coefficients")).toBeEmpty();
  await expect(dialog.locator("#calibration-maxObservationDistance")).toBeEmpty();
  await dialog.locator("#calibration-resolution").fill("0.2");
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("1e-9…0.1");
  await chooseOption(page, "Что рассчитать", "Отчёты по модели дна");
  await expect(dialog.getByRole("combobox", { name: "Подтип отчёта" })).toHaveText("Поле размера ячеек");
  for (const [field, definition] of Object.entries(adaptiveParameterDefinitions)) {
    const input = dialog.locator(`#adapt-${field}`);
    await expect(input).toHaveValue(String(definition.defaultValue));
    await expect(input).toHaveAttribute("min", String(definition.minimum));
    await expect(input).toHaveAttribute("max", String(definition.maximum));
  }
  await dialog.locator("#adapt-minSize").fill("600");
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("min ≤ coast ≤ shelf ≤ deep");
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});
const job = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "erosion",
  status: "queued",
  input: { steps: 4 },
  inputSchemaVersion: 1,
  resultSummary: null,
  resultSchemaVersion: null,
  coreVersion: null,
  methodId: null,
  methodRevision: null,
  commandLine: null,
  errorMessage: null,
  createdAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T12:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  artifacts: [],
} satisfies CalculationJobDto;
const kinds = [
  { kind: "dimension", title: "Размерность", description: "Тестовый сценарий" },
  {
    kind: "dimension_dataset",
    title: "Своя береговая линия",
    description: "GeoJSON LineString",
  },
  { kind: "erosion", title: "Размыв", description: "Тестовый сценарий" },
  { kind: "erosion_file", title: "Эрозия по своим данным", description: "CERC" },
  { kind: "map", title: "Карта", description: "Тестовый сценарий" },
] satisfies CalculationKindDto[];
const dataset = {
  id: "33333333-3333-4333-8333-333333333333",
  schemaVersion: 1,
  name: "Тестовый контур",
  source: "Локальная съёмка",
  sourceRevision: null,
  license: "Тестовое использование",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  pointCount: 3,
  sizeBytes: 78,
  sha256: "a".repeat(64),
  createdAt: "2026-09-29T12:00:00.000Z",
} satisfies DatasetDto;

function savedExample(
  example: (typeof coastlineExamples)[number],
  id: string
): DatasetDto {
  const geometryBytes = Buffer.from(JSON.stringify(example.dataset.geometry));
  return {
    ...dataset,
    id,
    name: example.dataset.name,
    source: example.dataset.source,
    sourceRevision: example.dataset.sourceRevision ?? null,
    license: example.dataset.license,
    crs: example.dataset.crs,
    coordinateUnit: example.dataset.coordinateUnit,
    pointCount: example.dataset.geometry.coordinates.length,
    sizeBytes: geometryBytes.length,
    sha256: example.sha256,
  };
}

const datasetDetail: DatasetDetailDto = {
  ...savedExample(defaultCoastlineExample, dataset.id),
  name: "Берег для исследования",
  geometry: defaultCoastlineDataset.geometry,
};

const checkedCoastline: CoastlineValidationDto = {
  jobId: "66666666-6666-4666-8666-666666666666", status: "succeeded", accepted: true,
  issues: [], truncated: false, message: null, methodId: "coastline-validation",
  methodRevision: "geometry-1", updatedAt: "2026-10-21T09:00:00.000Z",
};

test("проверка загрузки: очередь, замечания, повтор и доступ к расчёту", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  let state: CoastlineValidationDto = { ...checkedCoastline, status: "queued", accepted: null };
  let starts = 0;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === `/api/datasets/${dataset.id}`) return { body: { ...datasetDetail, validation: state } };
    if (path === `/api/datasets/${dataset.id}/validation`) {
      if (method === "POST") { starts++; state = checkedCoastline; }
      return { body: state };
    }
  });
  await page.goto(`/lab/datasets/${dataset.id}`);
  await expect(page.getByRole("region", { name: "Проверка геометрии береговой линии" }).getByRole("status")).toHaveText("Проверка геометрии в очереди");
  await expect(page.getByRole("button", { name: "Рассчитать размерность" })).toBeDisabled();
  state = { ...state, status: "running" };
  await expect(page.getByRole("region", { name: "Проверка геометрии береговой линии" }).getByRole("status")).toHaveText("Go проверяет геометрию");
  state = { ...state, status: "failed", accepted: false, issues: [
    { severity: "error", code: "self_intersection", message: "Линия 1: пересекаются сегменты 1 и 3", segment: 1, otherSegment: 3 },
  ] };
  await expect(page.getByRole("list", { name: "Замечания проверки" })).toContainText("пересекаются сегменты 1 и 3");
  await expect(page.getByRole("button", { name: "Рассчитать размерность" })).toBeDisabled();
  await chooseTheme(page, "dark");
  await page.getByRole("button", { name: "Запустить проверку", exact: true }).click();
  await expect(page.getByRole("region", { name: "Проверка геометрии береговой линии" }).getByRole("status")).toHaveText("Проверка геометрии пройдена");
  await expect(page.getByRole("link", { name: "Рассчитать размерность" })).toBeVisible();
  expect(starts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("проверка загрузки: ошибка чтения, восстановление и остановка polling при уходе", async ({ page }) => {
  let unavailable = true, requests = 0;
  const observed = await mockApi(page, (path) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === `/api/datasets/${dataset.id}`) return { body: datasetDetail };
    if (path === "/api/datasets") return { body: [] };
    if (path === `/api/datasets/${dataset.id}/validation`) {
      requests++;
      return unavailable ? { status: 503, body: { message: "Проверка временно недоступна" } } :
        { body: { ...checkedCoastline, status: "running", accepted: null } };
    }
  });
  await page.goto(`/lab/datasets/${dataset.id}`);
  await expect(page.getByRole("alert")).toHaveText("Проверка временно недоступна");
  unavailable = false;
  await page.getByRole("button", { name: "Обновить состояние" }).click();
  await expect(page.getByRole("region", { name: "Проверка геометрии береговой линии" }).getByRole("status")).toHaveText("Go проверяет геометрию");
  await page.getByRole("link", { name: "Все наборы" }).click();
  await expect(page).toHaveURL(/\/lab\/datasets$/);
  const stopped = requests;
  await page.waitForTimeout(2300);
  expect(requests).toBe(stopped);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("проверка загрузки: структурная ошибка сохраняет паспорт и не отправляет запрос", async ({ page }) => {
  const posts: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") { posts.push(body); return { status: 201, body: dataset }; }
  });
  await page.goto("/lab/datasets");
  await page.getByRole("button", { name: "Добавить набор" }).click();
  for (const buffer of [Buffer.from('{"type":"LineString","coordinates":[[37,43]]}'), Buffer.alloc(65_537, " ")]) {
    await page.getByLabel("Файл GeoJSON").setInputFiles({ name: "survey.geojson", mimeType: "application/geo+json", buffer });
    await page.getByLabel("Название", { exact: true }).fill("Моя съёмка");
    await page.getByLabel("Источник данных").fill("Личный архив");
    await page.getByLabel("Лицензия или условия использования").fill("Согласовано автором");
    await page.locator("#dataset-creation").getByRole("button", { name: "Сохранить набор" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue("Моя съёмка");
    await expect(page.getByLabel("Источник данных")).toHaveValue("Личный архив");
    await expect(page.getByLabel("Лицензия или условия использования")).toHaveValue("Согласовано автором");
  }
  expect(posts).toEqual([]);
  expect(observed.unexpected).toEqual([]);
});

test("проверка загрузки: служебные виды скрыты, непринятый набор блокирует запуск", async ({ page }) => {
  const observed = await mockApi(page, (path) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations") return { body: [] };
    if (path === "/api/calculations/kinds") return { body: [...kinds,
      { kind: "source_file", title: "Проверить источник береговой линии", description: "Снимок", selectable: false },
      { kind: "dataset_validation", title: "Проверка малого набора", description: "Проверка", selectable: false },
      { kind: "coastline_validation", title: "Проверка научного контура", description: "Проверка", selectable: false },
    ] };
    if (path === "/api/datasets") return { body: [dataset] };
    if (path === `/api/datasets/${dataset.id}/validation`) return { body: { ...checkedCoastline, status: "failed", accepted: false,
      issues: [{ severity: "error", code: "duplicate_point", message: "Точки 1 и 2 совпадают" }] } };
  });
  await openNewCalculation(page);
  await page.getByLabel("Что рассчитать").click();
  await expect(page.getByRole("option", { name: "Проверить источник береговой линии", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Проверка малого набора", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Своя береговая линия", exact: true }).click();
  await page.getByLabel("Набор данных").click();
  await page.getByRole("option", { name: new RegExp(dataset.name) }).click();
  await expect(page.getByRole("list", { name: "Замечания проверки" })).toContainText("Точки 1 и 2 совпадают");
  await expect(page.getByRole("button", { name: "Запустить расчёт", exact: true })).toBeDisabled();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("api-client сохраняет двоичный ответ после обновления access token", async () => {
  let attempts = 0;
  const headers: (string | null)[] = [];
  const original = Buffer.from(JSON.stringify(datasetDetail.geometry));
  const client = createApiClient({ baseUrl: "http://example.test/api", fetch: async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/auth/login") || path.endsWith("/auth/refresh"))
      return Response.json({ ...session, accessToken: path.endsWith("/login") ? "initial-test-session" : "refreshed-test-session" });
    expect(path).toBe(`/api/datasets/${dataset.id}/content`);
    headers.push(new Headers(init?.headers).get("Authorization"));
    attempts += 1;
    return attempts === 1 ? Response.json({ message: "Сессия истекла" }, { status: 401 }) :
      new Response(new Uint8Array(original), { headers: { "Content-Type": "application/geo+json" } });
  } });
  await client.login({ email: user.email, password: "isolated-test-password" });
  const blob = await client.datasetContent(dataset.id);
  expect(Buffer.from(await blob.arrayBuffer())).toEqual(original);
  expect(headers).toEqual(["Bearer initial-test-session", "Bearer refreshed-test-session"]);
});

test("просмотр набора: карта, точный экспорт и явный переход к расчёту", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  let downloadFails = true;
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/datasets" && method === "GET") return { body: [datasetDetail] };
    if (path === `/api/datasets/${dataset.id}`) return { body: datasetDetail };
    if (path === `/api/datasets/${dataset.id}/content`) return downloadFails
      ? { status: 503, body: { message: "Файл временно недоступен" } } : { body: datasetDetail.geometry };
    if (path === "/api/calculations/kinds") return { body: kinds };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: job };
    }
    if (path === `/api/calculations/${job.id}`) return { body: job };
  });
  await page.goto("/lab/datasets");
  const card = page.getByRole("link", { name: datasetDetail.name, exact: true });
  await card.focus();
  await card.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/lab/datasets/${dataset.id}$`));
  await expect(page.getByRole("heading", { name: datasetDetail.name, level: 1 })).toBeVisible();
  await expect(page.getByTestId("dataset-map-line")).not.toHaveAttribute("d", "");
  await expect(page.getByTestId("dataset-map-bounds")).not.toHaveAttribute("d", "");
  await expect(page.getByText(datasetDetail.sha256, { exact: true })).toBeVisible();
  await expect(page.getByText("39.667927°", { exact: true })).toBeVisible();
  await chooseTheme(page, "dark");
  await page.getByRole("button", { name: "Увеличить карту" }).click();
  await page.getByRole("button", { name: "Показать весь участок" }).click();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await chooseTheme(page, "light");
  await page.getByRole("button", { name: "Скачать GeoJSON" }).click();
  await expect(page.getByRole("alert")).toHaveText("Файл временно недоступен");
  downloadFails = false;
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать GeoJSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`dataset-${dataset.id}.geojson`);
  const bytes = await readFile((await download.path())!);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(datasetDetail.sha256);
  expect(submissions).toEqual([]);
  await page.getByRole("link", { name: "Рассчитать размерность" }).click();
  await expect(page.getByRole("dialog", { name: "Новый расчёт" })).toBeVisible();
  await expect(page.getByLabel("Что рассчитать")).toContainText("Своя береговая линия");
  await expect(page.getByLabel("Набор данных")).toContainText(datasetDetail.name);
  expect(submissions).toEqual([]);
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${job.id}$`));
  expect(submissions).toEqual([{ kind: "dimension_dataset", input: { datasetId: dataset.id, reportType: "coastline_box_counting" } }]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("просмотр набора: ошибка с повтором, чужой и отсутствующий набор", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  let available = false;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === `/api/datasets/${dataset.id}`) return available ? { body: datasetDetail }
      : { status: 503, body: { message: "Хранилище временно недоступно" } };
    if (path.startsWith("/api/datasets/")) return { status: 404, body: { message: "Набор данных не найден" } };
    if (path === "/api/datasets") return { body: [datasetDetail] };
  });
  await page.goto(`/lab/datasets/${dataset.id}`);
  await expect(page.getByRole("alert")).toContainText("Хранилище временно недоступно");
  available = true;
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByRole("heading", { name: datasetDetail.name, level: 1 })).toBeVisible();
  for (const id of ["99999999-9999-4999-8999-999999999999", "88888888-8888-4888-8888-888888888888"]) {
    await page.goto(`/lab/datasets/${id}`);
    await expect(page.getByRole("alert")).toContainText("Набор не найден или недоступен вашему аккаунту");
    await expect(page.getByRole("button", { name: "Скачать GeoJSON" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Рассчитать размерность" })).toHaveCount(0);
    await expect(page.getByTestId("dataset-map-line")).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Все наборы" }).click();
  await expect(page.getByRole("heading", { name: "Наборы данных", level: 1 })).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("просмотр набора: отсутствующий UUID в форме не заменяется примером", async ({ page }) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/datasets") return { body: [] };
    if (path === "/api/calculations/kinds") return { body: kinds };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });
  await page.goto(`/lab?new=1&dataset=${dataset.id}`);
  await expect(page.getByRole("dialog", { name: "Новый расчёт" })).toBeVisible();
  await expect(page.getByText("Исходный набор больше недоступен.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "4. Результат" })).toContainText("Исходный набор данных недоступен");
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("просмотр набора: карта сохраняет размер и центрирование при смене ширины", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/styles/liberty", (route) => route.fulfill({
    json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#ffffff" } }] },
  }));
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === `/api/datasets/${dataset.id}`) return { body: datasetDetail };
  });
  await page.goto(`/lab/datasets/${dataset.id}`);
  const supportsWebGL = await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
  test.skip(!supportsWebGL, "WebGL недоступен в этом окружении; координатный резерв проверяется отдельно");
  await expect(page.getByRole("status").filter({ hasText: "Современная подложка" })).toBeVisible();
  for (const width of [1440, 360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator(".maplibregl-canvas").evaluate((canvas) => {
      const container = canvas.closest(".maplibregl-map")!;
      return container.clientHeight > 0 && canvas.clientHeight === container.clientHeight && canvas.clientWidth === container.clientWidth;
    })).toBe(true);
    await expect.poll(() => page.getByTestId("dataset-map-bounds").evaluate((path) => {
      const box = (path as SVGPathElement).getBBox();
      return Math.abs(box.x + box.width / 2 - 400) < 3 && Math.abs(box.y + box.height / 2 - 210) < 3;
    })).toBe(true);
  }
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("просмотр набора: нулевой охват остаётся доступен без подложки", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === `/api/datasets/${dataset.id}`) return { body: {
      ...datasetDetail, pointCount: 2,
      geometry: { type: "LineString", coordinates: [[39, 43], [39, 43]] },
    } };
  });
  await page.goto(`/lab/datasets/${dataset.id}`);
  await expect(page.getByTestId("dataset-map-line")).not.toHaveAttribute("d", /NaN|Infinity|^$/);
  await expect(page.getByRole("heading", { name: "Паспорт набора" })).toBeVisible();
  await page.getByRole("button", { name: "Увеличить карту" }).click();
  await page.getByRole("button", { name: "Показать весь участок" }).click();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

const articleInputRoles = [
  "seabed_msh",
  "bathymetry_source_json",
  "export_metadata_json",
  "adaptive_field_csv",
  "adaptive_field_report_json",
  "coastline_geojson",
] as const satisfies ScientificInputRole[];
const articleInputs: ScientificInputDto[] = articleInputRoles.map(
  (role, index) => ({
    id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`,
    role,
    name: `Архивный вход ${index + 1}`,
    filename: `input-${index + 1}.json`,
    sizeBytes: 1024,
    source: "Тестовый архив",
    license: "Тестовое использование",
    crs: "EPSG:4326",
    coordinateUnit: "degrees",
    status: "ready",
    sha256: "a".repeat(64),
    createdAt: "2026-09-29T12:00:00.000Z",
  })
);

const seabedKinds = [
  { kind: "mesh", title: "Плоская сетка", description: "Gmsh" },
  { kind: "seabed_build", title: "Построить модель дна", description: "GEBCO" },
  { kind: "seabed_render", title: "Карты и 3D-рельеф дна", description: "SVG" },
  { kind: "seabed_adapt", title: "Поле размера адаптивной сетки", description: "h(x,y)" },
] satisfies CalculationKindDto[];
const seabedBuildJob = { ...job, kind: "seabed_build", status: "succeeded" as const, input: {} } satisfies CalculationJobDto;
const seabedOutputs: ReusableScientificArtifactDto[] = ([
  ["seabed_msh", "seabed/black-sea-depth.msh"],
  ["export_metadata_json", "seabed/export-metadata.json"],
  ["bathymetry_source_json", "seabed/bathymetry-source.json"],
] as const).map(([role, filename], index) => ({
  id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
  role, filename, jobId: seabedBuildJob.id, jobKind: "seabed_build", sizeBytes: 1024,
  sha256: "b".repeat(64), createdAt: job.createdAt,
}));

async function mockSeabedFigures(page: Page, submissions: unknown[], source: CalculationJobDto = seabedBuildJob, missing = false, outputs = seabedOutputs, catalog: CalculationKindDto[] = seabedKinds) {
  return mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds") return { body: catalog };
    if (path === "/api/datasets") return { body: [] };
    if (path === "/api/scientific-inputs/reusable-artifacts") return { body: outputs };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: { ...job, id: "99999999-9999-4999-8999-999999999999" } };
    }
    if (path === `/api/calculations/${source.id}`) return missing ? { status: 404, body: { message: "Расчёт не найден" } } : { body: source };
    if (path === "/api/calculations/99999999-9999-4999-8999-999999999999") return { body: job };
  });
}

const regionKinds = [
  { kind: "coastline_region", title: "Выбрать участок побережья", description: "Участок из полного или своего контура" },
  { kind: "dimension_file", title: "Размерность полного контура", description: "Box-counting" },
  { kind: "erosion_file", title: "Эрозия по своим данным", description: "CERC" },
] satisfies CalculationKindDto[];
async function mockRegions(page: Page, submissions: unknown[], options: {
  source?: ScientificInputDto; previewFailure?: boolean; result?: CalculationJobDto; reusable?: ReusableScientificArtifactDto[];
} = {}) {
  const bytes = await readFile(new URL("../../lito-cli/data/coastline/black-sea.geojson", import.meta.url));
  const coastlinePreview = {
    source: "Закреплённый контур MarineRegions", sourceRevision: "Снимок из набора Litora", license: "CC-BY",
    sha256: createHash("sha256").update(bytes).digest("hex"), crs: "EPSG:4326",
    geojson: JSON.parse(bytes.toString("utf8")) as Record<string, unknown>,
  } satisfies CoastlinePreviewDto;
  const calls: string[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    calls.push(`${method} ${path}`);
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds") return { body: regionKinds };
    if (path === "/api/datasets") return { body: [] };
    if (path === "/api/scientific-inputs") return { body: options.source ? [options.source] : [] };
    if (path === "/api/scientific-inputs/reusable-artifacts") return { body: options.reusable ?? [] };
    if (path === "/api/calculations/coastline-preview") return { body: coastlinePreview };
    if (options.source && path === `/api/scientific-inputs/${options.source.id}/coastline-preview`)
      return options.previewFailure ? { status: 400, body: { message: "Свой контур сейчас недоступен" } } : { body: { ...coastlinePreview, source: "Собственный контур" } };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") { submissions.push(body); return { status: 201, body: { ...job, kind: "coastline_region" } }; }
    if (path === `/api/calculations/${job.id}`) return { body: options.result ?? { ...job, kind: "coastline_region" } };
  });
  return { ...observed, calls };
}

type ApiReply = { status?: number; body: unknown };

async function mockApi(
  page: Page,
  reply: (
    path: string,
    method: string,
    body: unknown,
    params: URLSearchParams
  ) => ApiReply | undefined | Promise<ApiReply | undefined>
) {
  const unexpected: string[] = [];
  const pageErrors: string[] = [];
  const ownedValidationSources = new Map<string, Record<string, unknown>>();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = undefined;
      }
      let result = await reply(path, method, body, url.searchParams);
      const validationRequest = /^\/api\/(datasets|scientific-inputs)\/([^/]+)\/validation$/.exec(path);
      if (!result && validationRequest && method === "GET") {
        const known = ownedValidationSources.get(`${validationRequest[1]}:${validationRequest[2]}`);
        if (known) result = { body: known.validation ?? {
          jobId: "66666666-6666-4666-8666-666666666666", status: "succeeded", accepted: true,
          issues: [], truncated: false, message: null, methodId: "coastline-validation", methodRevision: "geometry-1", updatedAt: "2026-10-21T09:00:00.000Z",
        } };
      }
      if (!result && path === "/api/scientific-inputs/formats" && method === "GET")
        result = { body: JSON.parse(await readFile(new URL("../../lito-cli/data/schemas/scientific-inputs-v1.json", import.meta.url), "utf8")) };
      if (!result && path === "/api/calculations/page" && method === "GET") {
        const legacy = await reply(
          "/api/calculations",
          "GET",
          undefined,
          url.searchParams
        );
        if (legacy && Array.isArray(legacy.body))
          result = {
            body: {
              items: legacy.body,
              nextCursor: null,
              totalCount: legacy.body.length,
            },
          };
      }
      if (
        !result &&
        method === "GET" &&
        (path === "/api/scientific-inputs" ||
          path === "/api/scientific-inputs/reusable-artifacts" ||
          path === "/api/scientific-inputs/catalogue")
      )
        result = { body: [] };
      if (!result && path === "/api/scientific-inputs/quota" && method === "GET")
        result = { body: { usedCount: 0, limitCount: 20, usedBytes: 0, limitBytes: 2 * 1024 ** 3 } satisfies ScientificInputQuotaDto };
      if (
        !result &&
        path === "/api/calculations/deletions-current" &&
        method === "GET"
      )
        result = { body: null };
      if (!result) {
        unexpected.push(`${method} ${path}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (path.startsWith("/api/datasets") || path.startsWith("/api/scientific-inputs")) {
        const family = path.startsWith("/api/datasets") ? "datasets" : "scientific-inputs";
        const records: unknown[] = Array.isArray(result.body) ? result.body : [result.body];
        for (const item of records) if (item && typeof item === "object" && !Array.isArray(item)) {
          const record = item as Record<string, unknown>;
          if (typeof record.id === "string") ownedValidationSources.set(`${family}:${record.id}`, record);
        }
      }
      await route.fulfill({
        status: result.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(result.body),
      });
    }
  );
  return { unexpected, pageErrors };
}

async function openNewCalculation(page: Page, theme?: "light" | "dark") {
  await page.goto("/lab");
  if (theme) await chooseTheme(page, theme);
  await page.getByRole("button", { name: "Новый расчёт", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Новый расчёт" })
  ).toBeVisible();
}

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function chooseTheme(page: Page, mode: "light" | "dark" | "system") {
  const button = page.getByRole("button", { name: /^Тема оформления:/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await button.getAttribute("data-theme");
    if (current === mode) return;
    const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
    await button.click();
    await expect(button).toHaveAttribute("data-theme", next);
  }
  await expect(button).toHaveAttribute("data-theme", mode);
}

async function selectArticleInput(page: Page, field: string, index: number) {
  await page.locator(`#scientific-${field}`).click();
  await page
    .getByRole("option", { name: new RegExp(`Архивный вход ${index + 1}`) })
    .click();
}

async function mockArticleCalculations(page: Page, submissions: unknown[]) {
  const articleKinds = [
    {
      kind: "seabed_adapt",
      title: "Поле размера",
      description: "Тестовый сценарий",
    },
    {
      kind: "seabed_compare_adaptive",
      title: "Сравнение сеток",
      description: "Тестовый сценарий",
    },
  ] satisfies CalculationKindDto[];
  return mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: articleKinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: articleInputs };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: job };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: job };
  });
}

test("форма показывает расход квоты после резервирования и удаления pending", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  let pending: ScientificInputDto | null = null;
  const quota = (): ScientificInputQuotaDto => ({
    usedCount: pending ? 1 : 0, limitCount: 20,
    usedBytes: pending ? pending.sizeBytes : 0, limitBytes: 2 * 1024 ** 3,
  });
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: [{ kind: "source_file", title: "Источник", description: "Тест" }] satisfies CalculationKindDto[] };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: pending ? [pending] : [] };
    if (path === "/api/scientific-inputs/quota" && method === "GET")
      return { body: quota() };
    if (path === "/api/scientific-inputs" && method === "POST") {
      pending = {
        id: "99999999-9999-4999-8999-999999999999", name: "coast.geojson",
        role: "coastline_geojson", filename: "coast.geojson", sizeBytes: 2,
        source: "Тест", license: "Тест", crs: "EPSG:4326", coordinateUnit: "degrees",
        status: "pending", sha256: null, createdAt: "2026-10-19T00:00:00.000Z",
      };
      return { status: 201, body: pending };
    }
    if (path === `/api/scientific-inputs/${pending?.id}/content` && method === "PUT")
      return { status: 503, body: { message: "Тестовый сбой передачи" } };
    if (path === `/api/scientific-inputs/${pending?.id}` && method === "DELETE") {
      pending = null;
      return { body: { deleted: true } };
    }
  });

  await openNewCalculation(page, "dark");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.getByText(/Зарезервировано 0 из 20 файлов/)).toBeVisible();
  await dialog.getByRole("button", { name: "Загрузить файл" }).click();
  await dialog.locator("#scientific-file").setInputFiles({
    name: "coast.geojson", mimeType: "application/geo+json", buffer: Buffer.from("{}"),
  });
  await dialog.locator("#scientific-source").fill("Тест");
  await dialog.locator("#scientific-license").fill("Тест");
  await dialog.getByRole("button", { name: "Сохранить приватный файл" }).click();
  await expect(dialog.getByText(/Зарезервировано 1 из 20 файлов/)).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить незавершённую запись" }).click();
  await expect(dialog.getByText(/Зарезервировано 0 из 20 файлов/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await chooseTheme(page, "light");
  await page.getByRole("button", { name: "Новый расчёт", exact: true }).click();
  await expect(dialog.getByText(/Зарезервировано 0 из 20 файлов/)).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("каталог показывает паспорт набора, поиск и адаптивную карточку", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const second = {
    ...dataset,
    id: "44444444-4444-4444-8444-444444444444",
    name: "Контур Анапы",
    source: "Архивная экспедиция",
    sourceRevision: "2025-08",
  } satisfies DatasetDto;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET")
      return { body: [dataset, second] };
  });

  await page.goto("/lab/datasets");
  await chooseTheme(page, "dark");
  await expect(
    page.getByRole("heading", { name: "Наборы данных" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  await expect(page.getByText(dataset.sha256)).toHaveCount(2);
  await expect(page.getByText("2 из 100 возможных")).toBeVisible();
  const savedList = page.getByRole("region", { name: "Сохранённые наборы" });
  const examples = page.getByRole("region", { name: "Каталог готовых данных" });
  expect(
    await savedList.evaluate(
      (element, examplesId) =>
        Boolean(
          element.compareDocumentPosition(
            document.getElementById(examplesId)!.closest("section")!
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
      "research-catalogue-heading"
    )
  ).toBe(true);
  await expect(examples.getByRole("listitem")).toHaveCount(24);
  await page
    .getByRole("textbox", { name: "Поиск по названию и источнику" })
    .fill("экспедиция");
  await expect(page.getByRole("heading", { name: second.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: dataset.name })).toHaveCount(
    0
  );
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).resolves.toBe(true);
  await chooseTheme(page, "light");
  await expect(page.getByRole("heading", { name: second.name })).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).resolves.toBe(true);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("учебные контуры различаются геометрией и имеют проверяемые суммы", () => {
  expect(new Set(coastlineExamples.map((example) => example.sha256)).size).toBe(
    3
  );
  for (const example of coastlineExamples) {
    const bytes = Buffer.from(JSON.stringify(example.dataset.geometry));
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(example.sha256).toBe(digest);
    expect(bytes.length).toBeLessThanOrEqual(65_536);
    expect(example.dataset.geometry.coordinates.length).toBeGreaterThan(2);
    expect(example.dataset.geometry.coordinates.length).toBeLessThanOrEqual(
      500
    );
    for (const [longitude, latitude] of example.dataset.geometry.coordinates) {
      expect(longitude).toBeGreaterThanOrEqual(-180);
      expect(longitude).toBeLessThanOrEqual(180);
      expect(latitude).toBeGreaterThanOrEqual(-90);
      expect(latitude).toBeLessThanOrEqual(90);
    }
  }
});

test("предложение названия различает совпадения и соблюдает лимит", () => {
  expect(suggestDatasetName("Берег", [" БЕРЕГ ", "берег (2)"])).toBe("Берег (3)");
  const longName = "Б".repeat(100);
  expect(suggestDatasetName(`${longName}лишнее`, [
    longName,
    `${"Б".repeat(96)} (2)`,
  ])).toBe(`${"Б".repeat(96)} (3)`);
  expect(suggestDatasetName("   ", [])).toBe("Береговая линия");
  for (const example of coastlineExamples) {
    const renamed = {
      ...savedExample(example, dataset.id),
      name: "Название пользователя",
    };
    expect(findSavedExample([renamed], example)).toBe(renamed);
    expect(findSavedExample([
      { ...renamed, sourceRevision: "Другая версия" },
    ], example)).toBeUndefined();
    expect(findSavedExample([
      { ...renamed, sha256: "0".repeat(64) },
    ], example)).toBeUndefined();
  }
});

test("каталог показывает сохранённые записи без предупреждения о повторах", async ({
  page,
}) => {
  const first = savedExample(
    defaultCoastlineExample,
    "77777777-7777-4777-8777-777777777771"
  );
  const copy = { ...first, id: "77777777-7777-4777-8777-777777777772" };
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET")
      return { body: [first, copy, dataset] };
  });

  await page.goto("/lab/datasets");
  const savedList = page.getByRole("region", { name: "Сохранённые наборы" });
  await expect(
    savedList.getByRole("heading", { name: first.name })
  ).toHaveCount(2);
  await expect(page.getByText("3 из 100 возможных")).toBeVisible();
  await expect(page.getByText(/Повторов:|Уникальных:/)).toHaveCount(0);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

async function researchGeometry(entry = researchCatalogue[0]) {
  const raw = await readFile(
    new URL(
      `../../../packages/generated-data/research/${entry.id}.geojson`,
      import.meta.url
    ),
    "utf8"
  );
  return parseResearchDataset(entry, JSON.parse(raw));
}
function savedResearch(
  entry = researchCatalogue[0],
  name = "Мой исследовательский берег"
): DatasetDto {
  return {
    ...dataset,
    ...entry.dataset,
    name,
    sourceRevision: entry.dataset.sourceRevision ?? null,
    pointCount: entry.pointCount,
    sha256: entry.sha256,
  };
}
function researchCard(page: Page, name: string) {
  return page
    .getByRole("region", { name: "Каталог готовых данных" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test("готовые данные: все 24 паспорта совпадают с GeoJSON и различают версии своих копий", async () => {
  expect(researchCatalogue).toHaveLength(24);
  expect(new Set(researchCatalogue.map((entry) => entry.id)).size).toBe(24);
  expect(new Set(researchCatalogue.map((entry) => entry.sha256)).size).toBe(24);
  for (const entry of researchCatalogue) {
    const prepared = await researchGeometry(entry);
    const bytes = Buffer.from(JSON.stringify(prepared.geometry));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    expect(bytes.length).toBeLessThanOrEqual(65_536);
    expect(prepared.geometry.coordinates).toHaveLength(entry.pointCount);
    const saved = savedResearch(entry);
    expect(findSavedResearchDataset([saved], entry)).toBe(saved);
    for (const difference of [
      { sha256: "0".repeat(64) },
      { sourceRevision: "Другая версия" },
      { license: "Другая лицензия" },
      { source: "Другой источник" },
      { pointCount: 2 },
    ])
      expect(
        findSavedResearchDataset([{ ...saved, ...difference }], entry)
      ).toBeUndefined();
    expect(() =>
      parseResearchDataset(entry, {
        type: "LineString",
        coordinates: [
          [1, 1],
          [2, 2],
        ],
      })
    ).toThrow(/паспортом/);
  }
});

test("готовые данные: каталог открыт сразу, поиск и превью доступны без создания записей", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (method === "POST") {
      submissions.push(body);
      return { status: 500, body: {} };
    }
  });
  await page.goto("/lab/datasets");
  const catalogue = page.getByRole("region", {
    name: "Каталог готовых данных",
  });
  await expect(catalogue.getByRole("listitem")).toHaveCount(24);
  await expect(catalogue.getByRole("img")).toHaveCount(24);
  const card = researchCard(page, researchCatalogue[0].name);
  await expect(
    card.getByRole("link", { name: "Оригинал в OSM" })
  ).toHaveAttribute("href", researchCatalogue[0].sourceUrl);
  await expect(card.getByRole("link", { name: "ODbL-1.0" })).toHaveAttribute(
    "href",
    researchCatalogue[0].licenseUrl
  );
  await card.getByText("Паспорт и ограничения", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(card.getByText(/Это дата базы, а не съёмки/)).toBeVisible();
  const name = card.getByRole("textbox", { name: "Название своей копии" });
  await name.fill("Мой черновик Сочи");
  const search = catalogue.getByRole("textbox", {
    name: "Поиск участка в каталоге",
  });
  await search.fill("синоп");
  await expect(
    catalogue.getByRole("heading", { name: "Синопский полуостров" })
  ).toBeVisible();
  await expect(catalogue.getByRole("listitem")).toHaveCount(1);
  await search.fill("неизвестный район");
  await expect(catalogue.getByText(/Участки не найдены/)).toBeVisible();
  await search.clear();
  await expect(name).toHaveValue("Мой черновик Сочи");
  expect(submissions).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const failure of ["network", "checksum"] as const) {
  test(`готовые данные: ошибка контура и повтор — ${failure}`, async ({
    page,
  }) => {
    const observed = await mockApi(page, (path, method) => {
      if (path === "/api/auth/refresh" && method === "POST")
        return { body: session };
      if (path === "/api/datasets" && method === "GET") return { body: [] };
    });
    const asset = /\/research\/sochi-01\.geojson/;
    const altered = await researchGeometry();
    altered.geometry.coordinates[0][0] += 0.00001;
    await page.route(asset, (route) =>
      failure === "network"
        ? route.abort()
        : route.fulfill({
            contentType: "application/geo+json",
            body: JSON.stringify(altered.geometry),
          })
    );
    await page.goto("/lab/datasets");
    const card = researchCard(page, researchCatalogue[0].name);
    await expect(card.getByRole("alert")).toContainText(
      "Не удалось загрузить контур"
    );
    await expect(
      card.getByRole("button", { name: "Сохранить набор" })
    ).toBeDisabled();
    await page.unroute(asset);
    await card
      .getByRole("button", { name: "Повторить загрузку контура" })
      .click();
    await expect(card.getByRole("img")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Сохранить набор" })
    ).toBeEnabled();
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

test("готовые данные: своё название, повтор после ошибки, паспорт и переход к проверке", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const entry = researchCatalogue.find((item) => item.id === "anapa-01")!;
  const prepared = await researchGeometry(entry);
  const saved = {
    ...savedResearch(entry, "Берег Анапы для сравнения"),
    validation: checkedCoastline,
  };
  const occupied = { ...dataset, name: entry.name };
  let savedSuccessfully = false;
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET")
      return { body: savedSuccessfully ? [saved, occupied] : [occupied] };
    if (path === `/api/datasets/${saved.id}` && method === "GET")
      return { body: { ...saved, geometry: prepared.geometry } };
    if (path === `/api/datasets/${saved.id}/validation` && method === "GET")
      return { body: checkedCoastline };
    if (path === "/api/datasets" && method === "POST") {
      submissions.push(body);
      if (submissions.length === 1)
        return {
          status: 503,
          body: { message: "Сохранение временно недоступно" },
        };
      savedSuccessfully = true;
      return { status: 201, body: saved };
    }
  });
  await page.goto("/lab/datasets");
  const card = researchCard(page, entry.name);
  const nameInput = card.getByLabel("Название своей копии", { exact: true });
  await expect(nameInput).toHaveValue(`${entry.name} (2)`);
  await expect(nameInput).toHaveAttribute("maxlength", "100");
  await expect(card.getByRole("img")).toBeVisible();
  await nameInput.fill("   ");
  await expect(
    card.getByRole("button", { name: "Сохранить набор" })
  ).toBeDisabled();
  expect(submissions).toEqual([]);
  await chooseTheme(page, "dark");
  await nameInput.fill(saved.name);
  await nameInput.press("Enter");
  await expect(card.getByRole("alert")).toHaveText(
    "Сохранение временно недоступно"
  );
  await expect(nameInput).toHaveValue(saved.name);
  await chooseTheme(page, "light");
  await nameInput.press("Enter");
  await expect(
    card.getByRole("button", { name: "Уже в моих наборах" })
  ).toBeDisabled();
  await expect(
    page
      .getByRole("region", { name: "Сохранённые наборы" })
      .getByRole("heading", { name: saved.name })
  ).toBeVisible();
  expect(submissions).toEqual([
    { ...prepared, name: saved.name },
    { ...prepared, name: saved.name },
  ]);
  await page.reload();
  await expect(nameInput).toHaveValue(saved.name);
  await expect(
    card.getByRole("button", { name: "Уже в моих наборах" })
  ).toBeDisabled();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).resolves.toBe(true);
  await card.getByRole("link", { name: "Открыть набор" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/datasets/${saved.id}$`));
  await expect(
    page.getByRole("heading", { name: saved.name, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Рассчитать размерность" })
  ).toBeEnabled();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const mode of ["loading", "error", "quota"] as const) {
  test(`готовые данные: каталог доступен, сохранение блокируется при ${mode}`, async ({
    page,
  }) => {
    const submissions: unknown[] = [];
    let release: (() => void) | undefined;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observed = await mockApi(page, async (path, method, body) => {
      if (path === "/api/auth/refresh" && method === "POST")
        return { body: session };
      if (path === "/api/datasets" && method === "GET") {
        if (mode === "loading") {
          await delayed;
          return { body: [] };
        }
        if (mode === "error")
          return { status: 403, body: { message: "Список недоступен" } };
        return {
          body: Array.from({ length: 100 }, (_, index) => ({
            ...dataset,
            id: `test-${index}`,
            name: `Контур ${index}`,
          })),
        };
      }
      if (method === "POST") {
        submissions.push(body);
        return { status: 500, body: {} };
      }
    });
    await page.goto("/lab/datasets");
    const catalogue = page.getByRole("region", {
      name: "Каталог готовых данных",
    });
    await expect(catalogue.getByRole("listitem")).toHaveCount(24);
    await expect(catalogue.getByRole("img")).toHaveCount(24);
    if (mode === "error")
      await expect(page.getByRole("alert")).toContainText("Список недоступен");
    if (mode === "quota")
      await expect(page.getByText(/Достигнут лимит 100 наборов/)).toBeVisible();
    for (const button of await catalogue
      .getByRole("button", { name: "Сохранить набор" })
      .all())
      await expect(button).toBeDisabled();
    if (mode === "loading") {
      release!();
      await expect(
        researchCard(page, researchCatalogue[0].name).getByRole("button", {
          name: "Сохранить набор",
        })
      ).toBeEnabled();
    }
    expect(submissions).toEqual([]);
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

for (const mode of [
  "existing",
  "response-lost",
  "double-submit",
  "quota-changed",
] as const) {
  test(`готовые данные: защита от повтора — ${mode}`, async ({ page }) => {
    const entry = researchCatalogue[0];
    const saved = { ...savedResearch(entry), validation: checkedCoastline };
    let armed = false,
      created = false;
    const submissions: unknown[] = [];
    const observed = await mockApi(page, async (path, method, body) => {
      if (path === "/api/auth/refresh" && method === "POST")
        return { body: session };
      if (path === "/api/datasets" && method === "GET") {
        if (created || (mode === "existing" && armed)) return { body: [saved] };
        if (mode === "quota-changed" && armed)
          return {
            body: Array.from({ length: 100 }, (_, index) => ({
              ...dataset,
              id: `test-${index}`,
            })),
          };
        return { body: [] };
      }
      if (path === "/api/datasets" && method === "POST") {
        submissions.push(body);
        created = true;
        if (mode === "response-lost")
          return {
            status: 503,
            body: { message: "Ответ потерян после сохранения" },
          };
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { status: 201, body: saved };
      }
    });
    await page.goto("/lab/datasets");
    const card = researchCard(page, entry.name);
    const input = card.getByRole("textbox", { name: "Название своей копии" });
    await expect(
      card.getByRole("button", { name: "Сохранить набор" })
    ).toBeEnabled();
    await input.fill("Собственное имя");
    armed = true;
    await input.evaluate((element) => {
      const form = element.closest("form")!;
      form.requestSubmit();
      form.requestSubmit();
    });
    if (mode === "quota-changed") {
      await expect(page.getByRole("alert")).toHaveText(/Достигнут лимит 100/);
      await expect(
        card.getByRole("button", { name: "Сохранить набор" })
      ).toBeDisabled();
    } else {
      await expect(
        card.getByRole("button", { name: "Уже в моих наборах" })
      ).toBeDisabled();
      await expect(
        card.getByRole("link", { name: "Открыть набор" })
      ).toHaveAttribute("href", `/lab/datasets/${saved.id}`);
    }
    expect(submissions).toHaveLength(
      mode === "existing" || mode === "quota-changed" ? 0 : 1
    );
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

test("готовые данные: мобильный экран, клавиатура и обе темы", async ({
  page,
}, testInfo) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
  });
  await page.goto("/lab/datasets");
  const catalogue = page.getByRole("region", {
    name: "Каталог готовых данных",
  });
  await expect(catalogue.getByRole("img")).toHaveCount(24);
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"] as const) {
      await chooseTheme(page, theme);
      const search = catalogue.getByRole("textbox", {
        name: "Поиск участка в каталоге",
      });
      await search.focus();
      await expect(search).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        researchCard(page, researchCatalogue[0].name).getByRole("link", {
          name: "Оригинал в OSM",
        })
      ).toBeFocused();
      await page.getByRole("link", { name: "Готовые участки: 24" }).click();
      const bounds = await catalogue.getByRole("heading", { name: "Каталог готовых данных" }).boundingBox();
      expect(bounds?.y).toBeGreaterThanOrEqual(60);
      await expect(
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).resolves.toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`catalogue-${width}-${theme}.png`),
      });
    }
  }
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("каталог создаёт набор отдельно от запуска расчёта", async ({ page }) => {
  const saved = { ...dataset, name: "Новый контур", source: "Полевой архив" };
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: saved };
    }
  });

  await page.goto("/lab/datasets");
  await expect(page.getByText("Пока нет сохранённых наборов")).toBeVisible();
  await expect(
    page.getByText("добавьте свой GeoJSON кнопкой «Добавить набор».", {
      exact: false,
    })
  ).toBeVisible();
  await page.getByRole("link", { name: "Источники и ограничения" }).click();
  await expect(page).toHaveURL(
    /\/docs\/reference\/black-sea-source-catalogue\.md$/
  );
  await expect(
    page.getByRole("heading", {
      name: "Каталог исходных данных Чёрного моря",
      exact: true,
      level: 1,
    })
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Пока нет сохранённых наборов")).toBeVisible();
  await page.getByRole("button", { name: "Добавить набор" }).click();
  await page.getByLabel("Файл GeoJSON").setInputFiles({
    name: "coast.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "LineString",
        coordinates: [
          [37, 44],
          [37.1, 44.1],
        ],
      })
    ),
  });
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue("coast");
  await page.getByLabel("Название", { exact: true }).fill(saved.name);
  await page.getByLabel("Источник данных").fill(saved.source);
  await page
    .getByLabel("Лицензия или условия использования")
    .fill(saved.license);
  await page
    .locator("#dataset-creation")
    .getByRole("button", { name: "Сохранить набор" })
    .click();

  await expect(page.getByRole("heading", { name: saved.name })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "сохранён" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить набор" })
  ).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    name: saved.name,
    source: saved.source,
    crs: "EPSG:4326",
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const entry of ["каталог", "форма расчёта"] as const) {
  test(`${entry}: совпадающие имена файлов получают номер и допускают замену`, async ({ page }) => {
    const occupied = [
      { ...dataset, name: " COAST " },
      { ...dataset, id: "44444444-4444-4444-8444-444444444444", name: "coast (2)" },
    ];
    const geometry = { type: "LineString", coordinates: [[37, 44], [37.1, 44.1]] };
    const bytes = Buffer.from(JSON.stringify(geometry));
    const saved = {
      ...dataset,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Мой берег",
      sourceRevision: "Съёмка-2025",
      pointCount: 2,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const submissions: unknown[] = [];
    const observed = await mockApi(page, (path, method, body) => {
      if (path === "/api/auth/refresh" && method === "POST") return { body: session };
      if (path === "/api/datasets" && method === "GET") return { body: occupied };
      if (path === "/api/calculations/kinds" && method === "GET") return { body: kinds };
      if (path === "/api/calculations" && method === "GET") return { body: [] };
      if (path === "/api/datasets" && method === "POST") {
        submissions.push(body);
        return { status: 201, body: saved };
      }
    });

    if (entry === "каталог") {
      await page.goto("/lab/datasets");
      await page.getByRole("button", { name: "Добавить набор" }).click();
    } else {
      await openNewCalculation(page);
      await chooseOption(page, "Что рассчитать", "Своя береговая линия");
      await page.getByRole("button", { name: "Загрузить GeoJSON" }).click();
    }
    await page.getByLabel("Файл GeoJSON").setInputFiles({
      name: "coast.JSON", mimeType: "application/json", buffer: bytes,
    });
    const nameInput = page.getByLabel("Название", { exact: true });
    await expect(nameInput).toHaveValue("coast (3)");
    await expect(nameInput).toHaveAttribute("maxlength", "100");
    await nameInput.fill("   ");
    await page.getByLabel("Источник данных").fill(saved.source);
    await page.getByLabel("Версия источника или дата снимка (необязательно)").fill(saved.sourceRevision);
    await page.getByLabel("Лицензия или условия использования").fill(saved.license);
    const upload = page.getByRole("region", { name: "Загрузить свой GeoJSON" });
    await upload.getByRole("button", { name: "Сохранить набор" }).click();
    await expect(page.getByRole("alert")).toHaveText("Укажите название набора");
    expect(submissions).toEqual([]);
    await nameInput.fill(`  ${saved.name}  `);
    await upload.getByRole("button", { name: "Сохранить набор" }).click();
    if (entry === "каталог") {
      await expect(page.getByRole("heading", { name: saved.name })).toBeVisible();
      await expect(page.getByText(saved.sha256)).toBeVisible();
    } else {
      await expect(page.getByLabel("Набор данных")).toContainText(saved.name);
    }
    expect(submissions).toEqual([{
      name: saved.name, source: saved.source, sourceRevision: saved.sourceRevision,
      license: saved.license, crs: "EPSG:4326", coordinateUnit: "degrees", geometry,
    }]);
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

test("каталог различает ошибку API и пустой результат поиска", async ({
  page,
}) => {
  let allowSuccess = false;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/datasets" && method === "GET") {
      return allowSuccess
        ? { body: [dataset] }
        : { status: 503, body: { message: "Хранилище временно недоступно" } };
    }
  });

  await page.goto("/lab/datasets");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Пока нет сохранённых наборов")).toHaveCount(0);
  allowSuccess = true;
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Поиск по названию и источнику" })
    .fill("неизвестный");
  await expect(
    page.getByText("По этому запросу наборы не найдены.", { exact: false })
  ).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("устаревшая ссылка на создание возвращает к обзору", async ({ page }) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await page.goto("/lab/calculations/new");
  await expect(page).toHaveURL(/\/lab$/);
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("обзор показывает старый queued и все пять активных после сотни завершённых", async ({ page }) => {
  const statuses = ["queued", "queued", "queued", "running", "running"] as const;
  const activeJobs: CalculationJobDto[] = statuses.map((status, index) => ({
    ...job,
    id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    status,
    createdAt: "2025-01-01T12:00:00.000Z",
  }));
  const completedJobs: CalculationJobDto[] = Array.from({ length: 100 }, (_, index) => ({
    ...job,
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    status: "succeeded",
    createdAt: "2026-10-18T12:00:00.000Z",
  }));
  const requestedStatuses: string[] = [];
  const observed = await mockApi(page, (path, method, _body, params) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET") return { body: kinds };
    if (path === "/api/calculations" && method === "GET") return { body: completedJobs };
    if (path === "/api/calculations/page" && method === "GET") {
      const status = params.get("status");
      requestedStatuses.push(status ?? "");
      const items = activeJobs.filter((item) => item.status === status);
      return { body: { items, nextCursor: null, totalCount: items.length } };
    }
  });

  await page.goto("/lab");
  const active = page.getByRole("region", { name: "Сейчас выполняются" });
  await expect(active.getByRole("listitem")).toHaveCount(5);
  await expect(active.getByText("Активных расчётов: 5.")).toBeVisible();
  await expect(active.locator(`a[href="/lab/calculations/${activeJobs[0].id}"]`)).toBeVisible();
  expect(requestedStatuses).toContain("queued");
  expect(requestedStatuses).toContain("running");
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("ошибка активных расчётов не выглядит пустотой и сохраняет последний снимок", async ({ page }) => {
  let allowActive = false;
  const observed = await mockApi(page, (path, method, _body, params) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET") return { body: kinds };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations/page" && method === "GET" && params.has("status")) {
      if (!allowActive) return { status: 503, body: { message: "База временно недоступна" } };
      const items = params.get("status") === "queued" ? [job] : [];
      return { body: { items, nextCursor: null, totalCount: items.length } };
    }
  });

  await page.goto("/lab");
  const active = page.getByRole("region", { name: "Сейчас выполняются" });
  await expect(active.getByText("Сведения об активных расчётах временно недоступны.")).toBeVisible();
  await expect(active.getByText("Нет активных расчётов.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Пока нет расчётов.", { exact: false })).toBeVisible();

  allowActive = true;
  await page.getByRole("button", { name: "Повторить загрузку активных расчётов" }).click();
  await expect(active.getByRole("listitem")).toHaveCount(1);
  allowActive = false;
  await expect(active.getByText("Показаны последние полученные данные; обновление не удалось.")).toBeVisible({ timeout: 10_000 });
  await expect(active.getByRole("listitem")).toHaveCount(1);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("обзор сообщает об усечении активных и отдельно об ошибке недавних", async ({ page }) => {
  const observed = await mockApi(page, (path, method, _body, params) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET") return { body: kinds };
    if (path === "/api/calculations" && method === "GET")
      return { status: 503, body: { message: "История временно недоступна" } };
    if (path === "/api/calculations/page" && method === "GET") {
      const items = params.get("status") === "queued" ? [job] : [];
      return { body: { items, nextCursor: null, totalCount: items.length ? 2 : 0 } };
    }
  });

  await page.goto("/lab");
  const active = page.getByRole("region", { name: "Сейчас выполняются" });
  const recent = page.getByRole("region", { name: "Недавние расчёты" });
  await expect(active.getByText("Показано 1 из 2 активных расчётов.")).toBeVisible();
  await expect(active.getByRole("listitem")).toHaveCount(1);
  await expect(recent.getByText("Сведения о недавних расчётах временно недоступны.")).toBeVisible();
  await expect(recent.getByText("Пока нет расчётов.", { exact: false })).toHaveCount(0);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("расчёт из истории открывает редактируемые параметры без автоматического запуска", async ({
  page,
}) => {
  const fields = ["coastlineInputId", "waveInputId", "bathymetryInputId", "bathymetryMetadataInputId"] as const;
  const roles = ["coastline_geojson", "wave_climate", "bathymetry_grid_json", "bathymetry_grid_metadata_json"] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0], role, id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Сохранённый вход ${index + 1}`,
  }));
  const storedInputs = Object.fromEntries(fields.map((field, index) => [field, inputs[index].id]));
  const original = { ...job, kind: "erosion_file", input: { ...erosionFileDefaults, ...storedInputs, steps: 4 }, status: "succeeded" as const };
  const created = {
    ...original,
    id: "44444444-4444-4444-8444-444444444444",
    input: { steps: 5 },
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET") return { body: inputs };
    if (path === "/api/calculations" && method === "GET")
      return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET")
      return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });

  await page.goto(`/lab/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog).toBeVisible();
  const steps = dialog.getByLabel("Шаги волнового ряда (0–48; 0 — весь ряд)");
  await expect(steps).toHaveValue("4");
  expect(submitted).toBeUndefined();
  await steps.fill("5");
  await dialog.getByLabel("Коэффициент CERC").fill("0.5");
  await dialog.getByLabel("Сохранить CSV метрик").check();
  await chooseOption(page, "Формат CSV", "Wide — столбцы по состояниям");
  await dialog.getByLabel("Сохранить анимацию GIF").check();
  await dialog.getByLabel("Кадров в секунду (1–30)").fill("8");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({
    kind: "erosion_file",
    input: {
      ...erosionFileDefaults,
      ...storedInputs,
      steps: 5,
      cercCoefficient: 0.5,
      outputCsv: true,
      csvFormat: "wide",
      outputGif: true,
      gifFps: 8,
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("полный расчёт по своим данным позволяет настроить GIF и повторить параметры", async ({
  page,
}) => {
  const fullKind = [
    { kind: "all_file", title: "Полный расчёт по своим данным", description: "CERC" },
  ] satisfies CalculationKindDto[];
  const fields = ["coastlineInputId", "waveInputId", "bathymetryInputId", "bathymetryMetadataInputId"] as const;
  const roles = ["coastline_geojson", "wave_climate", "bathymetry_grid_json", "bathymetry_grid_metadata_json"] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0], role, id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Сохранённый вход ${index + 1}`,
  }));
  const storedInputs = Object.fromEntries(fields.map((field, index) => [field, inputs[index].id]));
  const original = {
    ...job,
    kind: "all_file" as const,
    status: "succeeded" as const,
    input: {
      ...allFileDefaults,
      ...storedInputs,
      steps: 4,
      outputGif: true,
      gifFps: 8,
      gifSkip: 2,
    },
  };
  const created = {
    ...original,
    id: "99999999-9999-4999-8999-999999999999",
    status: "queued" as const,
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: fullKind };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET") return { body: inputs };
    if (path === "/api/calculations" && method === "GET")
      return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET")
      return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/lab/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog.getByText("Демонстрационный сценарий")).toHaveCount(0);
  await expect(dialog.getByLabel("Шаги волнового ряда (0–48; 0 — весь ряд)")).toHaveValue(
    "4"
  );
  await expect(dialog.getByLabel("Сохранить анимацию GIF")).toBeChecked();
  await dialog.getByLabel("Кадров в секунду (1–30)").fill("12");
  await dialog
    .getByLabel("Максимум точек базовой модели (0 или 2–10000)")
    .fill("300");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({
    kind: "all_file",
    input: {
      ...allFileDefaults,
      ...storedInputs,
      steps: 4,
      outputGif: true,
      gifFps: 12,
      gifSkip: 2,
      modelMaxPoints: 300,
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const demoKind of ["erosion", "all_demo"] as const) {
  for (const available of [true, false]) {
    test(`повтор демо требует своих данных: ${demoKind}, сценарий доступен=${available}`, async ({ page }) => {
      const ownKind = demoKind === "erosion" ? "erosion_file" : "all_file";
      const original = { ...job, kind: demoKind, status: "succeeded" as const,
        input: { ...erosionDemoDefaults, steps: 24, bermHeight: 90, coastlineInputId: articleInputs[5].id } };
      const submissions: unknown[] = [];
      const observed = await mockApi(page, (path, method, body) => {
        if (path === "/api/auth/refresh") return { body: session };
        if (path === "/api/calculations/kinds") return { body: [
          { kind: demoKind, title: "Историческое демо", description: "Демо", selectable: true },
          ...(available ? [{ kind: ownKind, title: "Исследование по своим данным", description: "CERC" }] : []),
        ] };
        if (path === "/api/datasets") return { body: [] };
        if (path === "/api/scientific-inputs") return { body: [articleInputs[5]] };
        if (path === "/api/calculations" && method === "GET") return { body: [original] };
        if (path === `/api/calculations/${job.id}`) return { body: original };
        if (path === "/api/calculations" && method === "POST") { submissions.push(body); return { body: job }; }
      });
      await page.setViewportSize({ width: 360, height: 800 });
      if (demoKind === "erosion") {
        await page.goto(`/lab/calculations/${original.id}`);
        await expect(page.getByText("Демонстрационный сценарий", { exact: false })).toBeVisible();
        await page.getByRole("link", { name: "Создать на основе" }).click();
      } else {
        await page.goto(`/lab/calculations?repeat=${original.id}`);
      }
      const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
      await expect(dialog.getByRole("alert")).toContainText("Повтор демонстрационного расчёта недоступен");
      await expect(dialog.getByRole("alert")).toContainText("параметры не перенесены");
      await expect(dialog.getByRole("link", { name: "Выбрать или подготовить данные" })).toHaveAttribute("href", "/lab/datasets");
      if (available) {
        await expect(dialog.getByLabel("Шаги волнового ряда (0–48; 0 — весь ряд)")).toHaveValue(String(ownKind === "erosion_file" ? erosionFileDefaults.steps : allFileDefaults.steps));
        await expect(dialog.locator("#erosion-bermHeight")).toBeEmpty();
        await expect(dialog.locator("#scientific-coastlineInputId")).toContainText("Выберите");
        await dialog.getByLabel("Что рассчитать").click();
        await expect(page.getByRole("option", { name: "Историческое демо" })).toHaveCount(0);
        await page.keyboard.press("Escape");
      } else {
        await expect(dialog.getByText("Сейчас нет доступных сценариев для запуска.")).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
      }
      expect(submissions).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(observed.unexpected).toEqual([]);
      expect(observed.pageErrors).toEqual([]);
    });
  }
}

test("новая форма исключает оба демо, даже когда API предлагает только их", async ({ page }) => {
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations/kinds") return { body: [
      { kind: "erosion", title: "Демо эрозии", description: "Демо" },
      { kind: "all_demo", title: "Демо конвейера", description: "Демо", selectable: true },
    ] };
    if (path === "/api/datasets" || (path === "/api/calculations" && method === "GET")) return { body: [] };
    if (path === "/api/calculations" && method === "POST") { submissions.push(body); return { body: job }; }
  });
  await openNewCalculation(page, "dark");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.getByText("Сейчас нет доступных сценариев для запуска.")).toBeVisible();
  await expect(dialog.getByLabel("Что рассчитать")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  await dialog.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(submissions).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("свой CERC выбирает приватные файлы и необязательный индексный профиль без демо", async ({
  page,
}) => {
  const ownKind = [
    {
      kind: "erosion_file",
      title: "Эрозия по своим данным",
      description: "CERC по своим данным",
    },
  ] satisfies CalculationKindDto[];
  const roles = [
    "coastline_geojson",
    "wave_climate",
    "bathymetry_grid_json",
    "bathymetry_grid_metadata_json",
    "longshore_sediment_sources_json",
  ] as const;
  const fields = [
    "coastlineInputId",
    "waveInputId",
    "bathymetryInputId",
    "bathymetryMetadataInputId",
  ] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0],
    role,
    id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Вход CERC ${index + 1}`,
    filename: index === 1 ? "waves.csv" : "grid.json",
  }));
  const created = {
    ...job,
    kind: "erosion_file" as const,
    input: {
      ...erosionFileDefaults,
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
      sedimentSourcesInputId: inputs[4].id,
    },
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: ownKind };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: inputs };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  await chooseOption(page, "Что рассчитать", "Эрозия по своим данным");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.getByText("Демонстрационный сценарий")).toHaveCount(0);
  for (let index = 0; index < fields.length; index += 1) {
    await dialog.locator(`#scientific-${fields[index]}`).click();
    await page
      .getByRole("option", { name: new RegExp(`Вход CERC ${index + 1}`) })
      .click();
  }
  await dialog.locator("#scientific-sedimentSourcesInputId").click();
  await page.getByRole("option", { name: /Вход CERC 5/ }).click();
  await fillCercSiteParameters(page);
  await dialog.locator("#erosion-steps").fill("8");
  await dialog
    .getByRole("button", { name: "Экспорт и численные ограничения" })
    .click();
  await dialog.getByLabel("Поток через левую границу").fill("0.02");
  await dialog.getByLabel("Поток через правую границу").fill("-0.01");
  await dialog.getByLabel("Сохранить анимацию GIF").check();
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({
    kind: "erosion_file",
    input: {
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
      sedimentSourcesInputId: inputs[4].id,
      ...erosionFileDefaults,
      steps: 8,
      outputGif: true,
      leftBoundaryTransport: 0.02,
      rightBoundaryTransport: -0.01,
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("свой CERC запускает весь ряд с ограниченной выборкой SVG и без GIF", async ({
  page,
}) => {
  const ownKind = [
    {
      kind: "erosion_file",
      title: "Эрозия по своим данным",
      description: "CERC по своим данным",
    },
  ] satisfies CalculationKindDto[];
  const roles = [
    "coastline_geojson",
    "wave_climate",
    "bathymetry_grid_json",
    "bathymetry_grid_metadata_json",
  ] as const;
  const fields = [
    "coastlineInputId",
    "waveInputId",
    "bathymetryInputId",
    "bathymetryMetadataInputId",
  ] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0],
    role,
    id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Вход полного ряда ${index + 1}`,
    filename: index === 1 ? "waves.csv" : "grid.json",
  }));
  const created = {
    ...job,
    kind: "erosion_file" as const,
    input: {
      ...erosionFileDefaults,
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
      steps: 0,
      svgMaxFrames: 24,
      outputGif: false,
    },
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: ownKind };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: inputs };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
  });
  await openNewCalculation(page, "dark");
  await chooseOption(page, "Что рассчитать", "Эрозия по своим данным");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  for (let index = 0; index < fields.length; index += 1) {
    await dialog.locator(`#scientific-${fields[index]}`).click();
    await page
      .getByRole("option", {
        name: new RegExp(`Вход полного ряда ${index + 1}`),
      })
      .click();
  }
  await dialog
    .getByRole("button", { name: "Экспорт и численные ограничения" })
    .click();
  await fillCercSiteParameters(page);
  await dialog.getByLabel("Сохранить анимацию GIF").check();
  await dialog.locator("#erosion-steps").fill("0");
  await expect(dialog.getByLabel("Максимум SVG эрозии (2–128)")).toHaveValue(
    "64"
  );
  await expect(dialog.getByLabel("Сохранить анимацию GIF")).toBeDisabled();
  await expect(dialog.getByLabel("Сохранить анимацию GIF")).not.toBeChecked();
  await dialog.getByLabel("Максимум SVG эрозии (2–128)").fill("24");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({ kind: "erosion_file", input: created.input });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("полный конвейер по своим файлам повторяет входы и параметры без подмены демо", async ({
  page,
}) => {
  const ownKind = [
    {
      kind: "all_file",
      title: "Полный конвейер по своим данным",
      description: "Свои входы",
    },
  ] satisfies CalculationKindDto[];
  const roles = [
    "coastline_geojson",
    "wave_climate",
    "bathymetry_grid_json",
    "bathymetry_grid_metadata_json",
    "longshore_structures_json",
  ] as const;
  const fields = [
    "coastlineInputId",
    "waveInputId",
    "bathymetryInputId",
    "bathymetryMetadataInputId",
  ] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0],
    role,
    id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Вход полного конвейера ${index + 1}`,
    filename: index === 1 ? "waves.csv" : "grid.json",
  }));
  const original = {
    ...job,
    kind: "all_file" as const,
    status: "succeeded" as const,
    input: {
      ...allFileDefaults,
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
      structuresInputId: inputs[4].id,
      steps: 0,
      svgMaxFrames: 16,
      modelMaxPoints: 0,
      noModelSimplify: true,
      leftBoundaryTransport: 0.04,
      rightBoundaryTransport: -0.03,
    },
  };
  const created = {
    ...original,
    id: "99999999-9999-4999-8999-999999999999",
    status: "queued" as const,
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: ownKind };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: inputs };
    if (path === "/api/calculations" && method === "GET")
      return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET")
      return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/lab/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog.getByText("Демонстрационный сценарий")).toHaveCount(0);
  await expect(dialog.locator("#erosion-steps")).toHaveValue("0");
  await expect(dialog.getByLabel("Максимум SVG эрозии (2–128)")).toHaveValue(
    "16"
  );
  await expect(dialog.getByLabel("Сохранить анимацию GIF")).toBeDisabled();
  await expect(
    dialog.getByLabel("Максимум точек базовой модели (0 или 2–10000)")
  ).toHaveValue("0");
  await expect(
    dialog.getByLabel("Максимум точек базовой модели (0 или 2–10000)")
  ).toBeDisabled();
  await expect(dialog.getByLabel("Не упрощать базовую линию")).toBeChecked();
  await expect(dialog.locator("#scientific-structuresInputId")).toContainText(
    "Вход полного конвейера 5"
  );
  await expect(
    dialog.getByLabel("Поток через левую границу")
  ).toHaveValue("0.04");
  await expect(
    dialog.getByLabel("Поток через правую границу")
  ).toHaveValue("-0.03");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({ kind: "all_file", input: original.input });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать паспорт JSON" }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(
    await readFile(await download.path(), "utf8")
  ) as CalculationMetadataExportV1;
  expect(exported.calculation.input).toMatchObject({
    steps: 0,
    svgMaxFrames: 16,
    leftBoundaryTransport: 0.04,
    rightBoundaryTransport: -0.03,
    structuresInputId: inputs[4].id,
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("повтор не отбрасывает недоступный индексный профиль без явного выбора", async ({
  page,
}) => {
  const ownKind = [
    {
      kind: "erosion_file",
      title: "Эрозия по своим данным",
      description: "Свои входы",
    },
  ] satisfies CalculationKindDto[];
  const roles = [
    "coastline_geojson",
    "wave_climate",
    "bathymetry_grid_json",
    "bathymetry_grid_metadata_json",
  ] as const;
  const fields = [
    "coastlineInputId",
    "waveInputId",
    "bathymetryInputId",
    "bathymetryMetadataInputId",
  ] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0],
    role,
    id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Вход повтора ${index + 1}`,
    filename: index === 1 ? "waves.csv" : "grid.json",
  }));
  const original = {
    ...job,
    kind: "erosion_file" as const,
    status: "succeeded" as const,
    input: {
      ...erosionFileDefaults,
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
      structuresInputId: "99999999-9999-4999-8999-999999999991",
    },
  };
  const created = {
    ...original,
    id: "99999999-9999-4999-8999-999999999992",
    status: "queued" as const,
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: ownKind };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: inputs };
    if (path === "/api/calculations" && method === "GET")
      return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET")
      return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });
  await page.goto(`/lab/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(
    dialog.getByText("Часть исходных данных больше недоступна.", {
      exact: false,
    })
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText(
    "Недоступный необязательный вход нужно явно заменить или исключить"
  );
  expect(submitted).toBeUndefined();
  await dialog
    .getByRole("button", { name: "Продолжить без недоступного профиля" })
    .click();
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({
    kind: "erosion_file",
    input: {
      ...erosionFileDefaults,
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("калибровка CERC требует наблюдения и фактический шаг батиметрии", async ({
  page,
}) => {
  const calibrationKind = [
    {
      kind: "calibrate_cerc",
      title: "Калибровка CERC по наблюдениям",
      description: "Годовой ряд",
    },
  ] satisfies CalculationKindDto[];
  const roles = [
    "coastline_geojson",
    "wave_climate",
    "bathymetry_grid_json",
    "bathymetry_grid_metadata_json",
    "shoreline_observations_json",
  ] as const;
  const fields = [
    "coastlineInputId",
    "waveInputId",
    "bathymetryInputId",
    "bathymetryMetadataInputId",
    "observationsInputId",
  ] as const;
  const inputs: ScientificInputDto[] = roles.map((role, index) => ({
    ...articleInputs[0],
    role,
    id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
    name: `Вход калибровки ${index + 1}`,
    filename: index === 1 ? "waves.csv" : "rates.json",
  }));
  const created = {
    ...job,
    kind: "calibrate_cerc" as const,
    input: {
      ...cercCalibrationDefaults,
      bathymetryResolution: 0.005,
      ...Object.fromEntries(
        fields.map((field, index) => [field, inputs[index].id])
      ),
    },
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: calibrationKind };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: inputs };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  await chooseOption(page, "Что рассчитать", "Калибровка CERC по наблюдениям");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(
    dialog.getByLabel("Фактический шаг батиметрии, градусы")
  ).toBeEmpty();
  await dialog.getByLabel("Фактический шаг батиметрии, градусы").fill("0.005");
  await expect(
    dialog.getByLabel("Коэффициенты CERC (1–8 через запятую)")
  ).toBeEmpty();
  await fillCercSiteParameters(page, "calibration");
  await dialog.locator("#calibration-coefficients").fill(cercCalibrationDefaults.cercCoefficients);
  await dialog.locator("#calibration-maxObservationDistance").fill("500");
  for (let index = 0; index < fields.length; index += 1) {
    await dialog.locator(`#scientific-${fields[index]}`).click();
    await page
      .getByRole("option", { name: new RegExp(`Вход калибровки ${index + 1}`) })
      .click();
  }
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(submitted).toEqual({ kind: "calibrate_cerc", input: created.input });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("результат калибровки показывает рейтинг Go без пересчёта и полный отчёт", async ({
  page,
}) => {
  const completed = {
    ...job,
    kind: "calibrate_cerc",
    status: "succeeded" as const,
    resultSummary: {
      fileCount: 2,
      totalBytes: 2048,
      metrics: {
        "cerc-calibration.json": {
          results: [
            {
              cerc_coefficient: 0.39,
              metrics: {
                rmse_m_per_year: 0.125,
                mae_m_per_year: 0.1,
                mbe_m_per_year: -0.05,
                r_squared: 0.85,
                count: 12,
              },
            },
            {
              cerc_coefficient: 0.2,
              metrics: {
                rmse_m_per_year: 0.5,
                mae_m_per_year: 0.4,
                mbe_m_per_year: 0.2,
                r_squared: 0.2,
                count: 12,
              },
            },
          ],
        },
      },
    },
    artifacts: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        category: "output",
        filename: "erosion/cerc-calibration.json",
        contentType: "application/json",
        sizeBytes: 2048,
        sha256: "b".repeat(64),
        downloadUrl: "https://example.test/signed-report",
      },
    ],
  } satisfies CalculationJobDto;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return {
        body: [
          {
            kind: "calibrate_cerc",
            title: "Калибровка CERC",
            description: "Годовой ряд",
          },
        ],
      };
    if (path === `/api/calculations/${completed.id}` && method === "GET")
      return { body: completed };
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/lab/calculations/${completed.id}`);
  const rating = page.getByRole("region", {
    name: "Рейтинг коэффициентов CERC",
  });
  await expect(rating.getByRole("row")).toHaveCount(3);
  await expect(rating.getByRole("row").nth(1)).toContainText("0,125");
  await expect(rating.getByRole("row").nth(2)).toContainText("0,5");
  await expect(
    page.getByRole("link", { name: "erosion/cerc-calibration.json" })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("отсутствующий исходный набор не заменяется примером без согласия", async ({
  page,
}) => {
  const original = {
    ...job,
    kind: "dimension_dataset",
    input: { datasetId: "55555555-5555-4555-8555-555555555555" },
  };
  const created = {
    ...job,
    id: "66666666-6666-4666-8666-666666666666",
    kind: "dimension_dataset",
    input: { datasetId: dataset.id },
  };
  let submitted: unknown;
  let datasetCreated = false;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") {
      datasetCreated = true;
      return { status: 201, body: dataset };
    }
    if (path === "/api/calculations" && method === "GET")
      return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET")
      return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET")
      return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });

  await page.goto(`/lab/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(
    dialog.getByText("Исходный набор больше недоступен.", { exact: false })
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText(
    "Исходный набор данных недоступен"
  );
  expect(datasetCreated).toBe(false);
  expect(submitted).toBeUndefined();
  await dialog
    .getByRole("button", {
      name: "Использовать встроенный пример вместо исходного",
    })
    .click();
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${created.id}$`));
  expect(datasetCreated).toBe(true);
  expect(submitted).toEqual({
    kind: "dimension_dataset",
    input: { datasetId: dataset.id, reportType: "coastline_box_counting" },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("недоступный научный файл требует нового выбора и закрытие возвращает фокус", async ({
  page,
}) => {
  const original = {
    ...job,
    kind: "dimension_file",
    input: { coastlineInputId: "77777777-7777-4777-8777-777777777777" },
  };
  let submitted = false;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return {
        body: [
          ...kinds,
          {
            kind: "dimension_file",
            title: "Полный контур",
            description: "Тест",
          },
        ],
      };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET")
      return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET")
      return { body: original };
    if (path === "/api/calculations" && method === "POST") {
      submitted = true;
      return { status: 201, body: original };
    }
  });

  await page.goto(`/lab/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(
    dialog.getByText("Часть исходных данных больше недоступна.", {
      exact: false,
    })
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Выберите вход:");
  expect(submitted).toBe(false);
  await dialog
    .getByRole("button", { name: "Закрыть окно нового расчёта" })
    .click();
  await expect(page).toHaveURL(/\/lab\/calculations$/);
  await expect(
    page.getByRole("link", { name: "Расчёты и отчёты" })
  ).toBeFocused();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("модальный запуск сохраняет фокус и не переполняет узкий экран", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await page.goto("/lab");
  await page.evaluate(() => {
    document.body.style.minHeight = "300vh";
  });
  const trigger = page.getByRole("button", {
    name: "Новый расчёт",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  await expect(overlay).toHaveCSS("backdrop-filter", "blur(3px)");
  await expect(overlay).not.toHaveCSS("animation-name", "none");
  await expect(dialog).not.toHaveCSS("animation-name", "none");
  await expect(dialog.getByLabel("Что рассчитать")).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Загрузить GeoJSON" })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 180)).toBeLessThanOrEqual(2);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - 390)).toBeLessThanOrEqual(2);

  const scrollPosition = await page.evaluate(() => window.scrollY);
  await page.mouse.move(2, 2);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollPosition);

  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]'))
      )
    ).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"]'))
    )
  ).toBe(true);

  const scenarioSelect = dialog.getByRole("combobox", {
    name: "Что рассчитать",
  });
  await scenarioSelect.focus();
  await scenarioSelect.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: "Размерность" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "Своя береговая линия" })
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(scenarioSelect).toContainText("Своя береговая линия");
  await dialog.getByRole("button", { name: "Загрузить GeoJSON" }).click();
  const dialogBody = dialog.locator('[data-slot="calculation-dialog-body"]');
  const bodySize = await dialogBody.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(bodySize.scrollHeight).toBeGreaterThan(bodySize.clientHeight);
  await dialogBody.hover();
  await page.mouse.wheel(0, 500);
  expect(
    await dialogBody.evaluate((element) => element.scrollTop)
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollPosition);
  await expect(
    dialog.getByRole("heading", { name: "Новый расчёт" })
  ).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "Запустить расчёт" })
  ).toBeInViewport();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Закрыть окно нового расчёта" })
    .click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page
    .getByRole("link", { name: "Расчёты и отчёты", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Расчёты", exact: true })
  ).toBeVisible();
  const historyTrigger = page.getByRole("button", {
    name: "Новый расчёт",
    exact: true,
  });
  await historyTrigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(historyTrigger).toBeFocused();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("кабинет и запуск доступны в эквиваленте 200% zoom в обеих темах", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 400 });
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await page.goto("/lab");
  const trigger = page.getByRole("button", {
    name: "Новый расчёт",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });

  for (const mode of ["light", "dark"] as const) {
    await chooseTheme(page, mode);
    await expect(page.locator("html")).toHaveClass(new RegExp(mode));
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Запустить расчёт" })
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Запустить расчёт" })
    ).toHaveCSS("opacity", "1");
    await expect(
      dialog.getByRole("heading", { name: "Новый расчёт" })
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Запустить расчёт" })
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(640);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400);

    await chooseOption(page, "Что рассчитать", "Своя береговая линия");
    await dialog.getByRole("button", { name: "Загрузить GeoJSON" }).click();
    const body = dialog.locator('[data-slot="calculation-dialog-body"]');
    expect(
      await body.evaluate((element) => element.scrollHeight)
    ).toBeGreaterThan(await body.evaluate((element) => element.clientHeight));
    await body.hover();
    await page.mouse.wheel(0, 500);
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`справка сценария сохраняет форму, клавиатуру и фокус · ${theme}`, async ({ page }) => {
    const coastline = { ...articleInputs[0], role: "coastline_geojson" as const, name: "Контур участка для формы" };
    const helpKinds: CalculationKindDto[] = [...kinds, {
      kind: "seabed_compare_adaptive", title: "Сравнение сеток", description: "Сравнение сеток по полю размера",
    }];
    let posts = 0;
    const observed = await mockApi(page, (path, method) => {
      if (path === "/api/auth/refresh") return { body: session };
      if (path === "/api/calculations/kinds") return { body: helpKinds };
      if (path === "/api/datasets") return { body: [] };
      if (path === "/api/scientific-inputs") return { body: [coastline] };
      if (path === "/api/calculations") { if (method === "POST") posts++; return { body: [] }; }
    });
    await page.setViewportSize({ width: 360, height: 640 });
    await openNewCalculation(page, theme);
    await chooseOption(page, "Что рассчитать", "Эрозия по своим данным");
    const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
    await dialog.locator("#scientific-coastlineInputId").click();
    await page.getByRole("option", { name: /Контур участка для формы/ }).click();
    await dialog.locator("#erosion-steps").fill("7");
    await dialog.locator("#erosion-bermHeight").fill("2.5");
    await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Выберите вход:");
    await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
    await expect(dialog.getByText("Ваш локальный контур, волновой ряд CSV/JSON", { exact: false })).toHaveCount(0);
    const trigger = dialog.getByRole("button", { name: "Справка о расчёте «Эрозия по своим данным»", exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    const help = page.getByRole("dialog", { name: "Справка: Эрозия по своим данным", exact: true });
    await expect(help).toHaveAttribute("aria-modal", "true");
    const close = help.getByRole("button", { name: "Закрыть справку", exact: true });
    await expect(close).toBeFocused();
    const method = help.getByRole("link", { name: /О модели CERC и её ограничениях/ });
    await expect(method).toHaveAttribute("target", "_blank");
    await expect(method).toHaveAttribute("rel", "noopener noreferrer");
    const helpBody = help.getByRole("region", { name: "Содержание справки" });
    await page.keyboard.press("Tab");
    await expect(helpBody).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(method).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(helpBody).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press("Tab");
      expect(await help.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(help).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(dialog.locator("#erosion-steps")).toHaveValue("7");
    await expect(dialog.locator("#erosion-bermHeight")).toHaveValue("2.5");
    await expect(dialog.locator("#scientific-coastlineInputId")).toContainText(coastline.name);
    await expect(dialog.locator("#erosion-bermHeight-hint")).toContainText("Технический диапазон");
    await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Выберите вход:");
    await trigger.press("Space");
    await expect(help).toBeVisible();
    await close.click();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(help).toBeVisible();
    await page.locator('[data-slot="dialog-overlay"]').last().click({ position: { x: 2, y: 2 } });
    await expect(help).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/private/tmp/litora-0076-${theme}-form.png` });
    await chooseOption(page, "Что рассчитать", "Сравнение сеток");
    const compareTrigger = dialog.getByRole("button", { name: "Справка о расчёте «Сравнение сеток»", exact: true });
    await compareTrigger.click();
    const compareHelp = page.getByRole("dialog", { name: "Справка: Сравнение сеток", exact: true });
    await expect(compareHelp.getByText("Расчёт может занять часы", { exact: false })).toBeVisible();
    await expect(compareHelp.getByText("Ваш локальный контур, волновой ряд CSV/JSON", { exact: false })).toHaveCount(0);
    const body = compareHelp.getByRole("region", { name: "Содержание справки" });
    await body.focus();
    await body.press("PageDown");
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(compareHelp.getByRole("button", { name: "Закрыть справку" })).toBeInViewport();
    await expect(compareHelp.getByRole("link")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.screenshot({ path: `/private/tmp/litora-0076-${theme}-help.png` });
    await page.keyboard.press("Escape");
    await expect(compareTrigger).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Новый расчёт", exact: true })).toBeFocused();
    expect(posts).toBe(0);
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

test("справка перед запуском объясняет входы и ограничения каждого сценария", async ({
  page,
}) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  for (const item of [
    {
      kind: "dimension",
      source: "Полный закреплённый контур MarineRegions (9 635 точек)",
      limitation: "Оценка зависит от детализации линии",
      reference: "fractal-analysis-scope.md",
    },
    {
      kind: "dimension_dataset",
      source: "Ваш GeoJSON LineString",
      limitation: "Загрузка не подтверждает научную пригодность линии",
      reference: "coastline-source-selection.md",
    },
    {
      kind: "map",
      source: "Полный закреплённый контур MarineRegions и локальный участок Сочи",
      limitation: "Граница морского района нужна для обзора",
      reference: "black-sea-map.md",
    },
    {
      kind: "erosion_file",
      source: "Ваш локальный контур, волновой ряд CSV/JSON",
      limitation: "Без независимой калибровки результат не является прогнозом размыва",
      reference: "cerc-one-line-model.md",
    },
  ]) {
    await chooseOption(
      page,
      "Что рассчитать",
      kinds.find((kind) => kind.kind === item.kind)?.title ?? item.kind
    );
    await expect(dialog.getByText(item.source, { exact: false })).toHaveCount(0);
    await expect(dialog.getByText(item.limitation, { exact: false })).toHaveCount(0);
    const helpTrigger = dialog.getByRole("button", { name: /^Справка о расчёте/ });
    await helpTrigger.click();
    const help = page.getByRole("dialog", { name: /^Справка:/ });
    await expect(help.getByText(item.source, { exact: false })).toBeVisible();
    await expect(help.getByText(item.limitation, { exact: false })).toBeVisible();
    await expect(help.getByRole("link", { name: /откроется в новой вкладке/ }))
      .toHaveAttribute("href", `/docs/reference/${item.reference}`);
    await help.getByRole("button", { name: "Закрыть справку" }).click();
    await expect(helpTrigger).toBeFocused();
  }
  await expect(dialog.getByText("Демонстрационный сценарий")).toHaveCount(0);
  await expect(dialog.locator("footer").getByText("Демо")).toHaveCount(0);
  await expect(dialog.getByText("до 5 незавершённых расчётов")).toBeVisible();
  await dialog.getByRole("button", { name: /^Справка о расчёте/ }).click();
  const help = page.getByRole("dialog", { name: /^Справка:/ });
  const referencePage = page.waitForEvent("popup");
  await help
    .getByRole("link", { name: /О модели CERC и её ограничениях/ })
    .click();
  const referenceTab = await referencePage;
  await expect(referenceTab).toHaveURL(
    /\/docs\/reference\/cerc-one-line-model\.md$/
  );
  await expect(
    referenceTab.getByRole("heading", {
      level: 1,
      name: "Инженерная одномерная модель CERC",
    })
  ).toBeVisible();
  await referenceTab.close();
  await help.getByRole("button", { name: "Закрыть справку" }).click();
  await expect(dialog).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`участки побережья: выбор двух углов и ввод любой области, ${theme}`, async ({ page }, testInfo) => {
    const submissions: unknown[] = [];
    const observed = await mockRegions(page, submissions);
    await page.setViewportSize({ width: theme === "dark" ? 360 : 1280, height: 780 });
    await openNewCalculation(page, theme);
    const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
    const map = dialog.getByRole("img", { name: /^Карта для выбора области/ });
    await expect(map).toBeVisible();
    await map.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("region-picker-full.png") });
    const box = await map.boundingBox(); if (!box) throw new Error("Карта не имеет размера");
    await map.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
    await expect(dialog.getByText("Первый угол отмечен. Выберите второй угол.")).toBeVisible();
    await map.click({ position: { x: box.width * 0.7, y: box.height * 0.6 } });
    expect(Number(await dialog.locator("#region-west").inputValue())).toBeGreaterThan(27);
    expect(Number(await dialog.locator("#region-east").inputValue())).toBeLessThan(42.5);
    // Точный ввод остаётся доступным без взаимодействия с картой.
    await dialog.getByRole("spinbutton", { name: "Западная долгота, °", exact: true }).focus();
    for (const [field, value] of Object.entries({ west: "29", east: "31.5", south: "44.5", north: "46.5" })) {
      await expect(dialog.locator(`#region-${field}`)).toBeFocused();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(value);
      await page.keyboard.press("Tab");
    }
    await dialog.getByRole("button", { name: "Приблизить к области", exact: true }).click();
    await map.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("region-picker.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(theme === "dark" ? 360 : 1280);
    await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toEqual({ kind: "coastline_region", input: { west: 29, east: 31.5, south: 44.5, north: 46.5 } });
    expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
  });
}

test("участки побережья: свой источник не подменяется встроенным при ошибке карты", async ({ page }) => {
  const source = { ...articleInputs[5], name: "Мой контур" };
  const observed = await mockRegions(page, [], { source, previewFailure: true });
  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.getByRole("img", { name: /^Карта для выбора области/ })).toBeVisible();
  const builtInRequests = observed.calls.filter((path) => path === "GET /api/calculations/coastline-preview").length;
  await dialog.locator("#scientific-coastlineInputId").click();
  await page.getByRole("option", { name: /Мой контур/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("Свой контур сейчас недоступен");
  await expect(dialog.locator("#scientific-coastlineInputId")).toContainText("Мой контур");
  expect(observed.calls.filter((path) => path === "GET /api/calculations/coastline-preview")).toHaveLength(builtInRequests);
  await dialog.getByRole("button", { name: "Использовать встроенный контур", exact: true }).click();
  await expect(dialog.getByRole("img", { name: /^Карта для выбора области/ })).toBeVisible();
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

test("участки побережья: выделенная линия подставляется в следующий расчёт по UUID", async ({ page }) => {
  const artifact = { id: "88888888-8888-4888-8888-888888888888", jobId: job.id, jobKind: "coastline_region", role: "coastline_geojson", filename: "region/segments/segment-001.geojson", sizeBytes: 1024, sha256: "d".repeat(64), createdAt: job.createdAt } satisfies ReusableScientificArtifactDto;
  const result = { ...job, kind: "coastline_region", status: "succeeded" as const, artifacts: [{ id: artifact.id, category: "output" as const, filename: artifact.filename, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256, contentType: "application/geo+json", downloadUrl: "/private/coast.geojson" }] } satisfies CalculationJobDto;
  const submissions: unknown[] = [];
  const observed = await mockRegions(page, submissions, { result, reusable: [artifact] });
  await page.goto(`/lab/calculations/${job.id}`);
  await page.getByRole("link", { name: "Размерность этой линии", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.locator("#scientific-coastlineInputId")).toContainText(artifact.filename);
  await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toEqual({ kind: "dimension_file", input: { coastlineInputId: artifact.id, reportType: "coastline_box_counting" } });
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

test("участки побережья: схема скачивается из каталога и показаны источники данных", async ({ page }) => {
  const observed = await mockRegions(page, []);
  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await dialog.getByRole("button", { name: "Загрузить файл", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Скачать схему этого формата", exact: true }).click();
  const download = await downloading; const path = await download.path(); if (!path) throw new Error("Схема не скачалась");
  const schema = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  expect(schema.$id).toBe("urn:litora:input:coastline_geojson:v1");
  await expect(dialog.getByRole("link", { name: /MarineRegions · контуры морей/ })).toHaveAttribute("href", "https://www.marineregions.org/downloads.php");
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`карты дна: рисунки 3 и 5 наследуют модель и паспорта, ${theme}`, async ({ page }) => {
    const submissions: unknown[] = [];
    const observed = await mockSeabedFigures(page, submissions);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/lab/calculations/${seabedBuildJob.id}`);
    await chooseTheme(page, theme);
    const next = page.getByRole("link", { name: "Рисунок 5 · Фактическая сетка", exact: true });
    await next.focus();
    await next.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
    await expect(dialog.getByRole("combobox", { name: "Что рассчитать" })).toHaveText("Отчёты по модели дна");
    for (const field of ["modelInputId", "exportMetadataInputId", "sourceMetadataInputId"]) {
      await expect(dialog.locator(`#scientific-${field}`)).not.toHaveText(/Выберите|Нет подходящих/);
    }
    await expect(dialog.getByRole("combobox", { name: "Подтип отчёта" })).toHaveText("Фрагменты фактической сетки");
    await expect(dialog.getByText("Карты и сетки дна", { exact: false })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({ kind: "seabed_render", input: {
      modelInputId: seabedOutputs[0].id, exportMetadataInputId: seabedOutputs[1].id,
      sourceMetadataInputId: seabedOutputs[2].id, reportType: "mesh_details", isobaths: "20,50,100,200,500,1000,1500,2000",
    } });
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });
}

test("карты дна: рисунок 4 использует поле примера 200–1000 м и существующие файлы", async ({ page }) => {
  const submissions: unknown[] = [];
  const observed = await mockSeabedFigures(page, submissions);
  await page.goto(`/lab/calculations?new=1&workflow=size-field&source=${seabedBuildJob.id}`);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.locator("#adapt-minSize")).toHaveValue("200");
  await expect(dialog.locator("#adapt-coastSize")).toHaveValue("300");
  await expect(dialog.locator("#adapt-shelfSize")).toHaveValue("500");
  await expect(dialog.locator("#adapt-deepSize")).toHaveValue("1000");
  await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({ kind: "seabed_adapt", input: {
    modelInputId: seabedOutputs[0].id, sourceMetadataInputId: seabedOutputs[2].id,
    reportType: "size_field", minSize: 200, coastSize: 300, shelfSize: 500, deepSize: 1000,
  } });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`подтипы отчёта сохраняют файлы и параметры при переключении, ${theme}`, async ({ page }) => {
    const submissions: unknown[] = [];
    const observed = await mockSeabedFigures(page, submissions);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/lab/calculations");
    await chooseTheme(page, theme);
    await page.goto(`/lab/calculations?new=1&workflow=bathymetry&source=${seabedBuildJob.id}`);
    const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
    const subtype = dialog.getByRole("combobox", { name: "Подтип отчёта" });
    await expect(subtype).toHaveText("Обзор глубин");
    await expect(dialog.locator("#seabed-vertical")).toBeHidden();
    await dialog.locator("#seabed-isobaths").fill("25,100");
    await subtype.focus();
    await subtype.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option", { name: "Обзор глубин", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "Поле размера ячеек", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(subtype).toHaveText("Поле размера ячеек");
    await expect(subtype).toBeFocused();
    await expect(dialog.locator("#scientific-exportMetadataInputId")).toHaveCount(0);
    await expect(dialog.locator("#seabed-isobaths")).toHaveCount(0);
    await dialog.locator("#adapt-minSize").fill("220");
    await chooseOption(page, "Подтип отчёта", "Обзор глубин");
    await expect(dialog.locator("#seabed-isobaths")).toHaveValue("25,100");
    await expect(dialog.locator("#scientific-exportMetadataInputId")).not.toHaveText(/Выберите|Нет подходящих/);
    await chooseOption(page, "Подтип отчёта", "Поле размера ячеек");
    await expect(dialog.locator("#adapt-minSize")).toHaveValue("220");
    await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Новая сетка ещё не построена");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.screenshot({ path: `/private/tmp/litora-0078-${theme}-size-field.png` });
    await chooseOption(page, "Подтип отчёта", "Фрагменты фактической сетки");
    await page.screenshot({ path: `/private/tmp/litora-0078-${theme}-mesh-details.png` });
    await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({ kind: "seabed_render", input: {
      reportType: "mesh_details", isobaths: "25,100", modelInputId: seabedOutputs[0].id,
      exportMetadataInputId: seabedOutputs[1].id, sourceMetadataInputId: seabedOutputs[2].id,
    } });
    expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
  });
}

test("подтип отчёта восстанавливается при повторе с собственными файлами", async ({ page }) => {
  const submissions: unknown[] = [];
  const original = { ...seabedBuildJob, kind: "seabed_render", input: {
    reportType: "mesh_details", modelInputId: seabedOutputs[0].id, exportMetadataInputId: seabedOutputs[1].id,
    sourceMetadataInputId: seabedOutputs[2].id, isobaths: "10,50,150", verticalExaggeration: 65, controlPoints: false,
  } } satisfies CalculationJobDto;
  const observed = await mockSeabedFigures(page, submissions, original);
  await page.goto(`/lab/calculations?repeat=${original.id}`);
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Подтип отчёта" })).toHaveText("Фрагменты фактической сетки");
  await dialog.getByRole("button", { name: "Параметры дополнительного 3D-отчёта" }).click();
  await expect(dialog.locator("#seabed-vertical")).toHaveValue("65");
  await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({ kind: "seabed_render", input: original.input });
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

for (const state of ["ready", "queued", "missing"] as const) {
  test(`выбранный отчёт в задании: ${state}`, async ({ page }) => {
    const filename = "seabed/svg/mesh-details.svg";
    const selected = { ...seabedBuildJob, kind: "seabed_render", input: {
      reportType: "mesh_details", modelInputId: seabedOutputs[0].id,
      exportMetadataInputId: seabedOutputs[1].id, sourceMetadataInputId: seabedOutputs[2].id,
    },
      status: state === "queued" ? "queued" as const : "succeeded" as const,
      artifacts: state === "ready" ? [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", category: "output" as const,
        filename, contentType: "image/svg+xml", sizeBytes: 256, sha256: "c".repeat(64), downloadUrl: "/private/selected.svg" }] : [],
    } satisfies CalculationJobDto;
    await page.route("**/private/selected.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="teal"/></svg>' }));
    const observed = await mockSeabedFigures(page, [], selected);
    await page.goto(`/lab/calculations/${selected.id}`);
    const report = page.getByRole("region", { name: "Выбранный отчёт: Фрагменты фактической сетки" });
    await expect(report).toBeVisible();
    if (state === "ready") {
      await expect(report.getByRole("img", { name: "Рисунок 5 · Фрагменты фактической сетки" })).toBeVisible();
      await expect(page.getByRole("img")).toHaveCount(1);
      const downloading = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать паспорт JSON", exact: true }).click();
      const path = await (await downloading).path();
      if (!path) throw new Error("Паспорт не скачался");
      const passport = JSON.parse(await readFile(path, "utf8")) as { calculation: { input: { reportType: string } } };
      expect(passport.calculation.input.reportType).toBe("mesh_details");
    } else if (state === "queued") await expect(report.getByRole("status")).toContainText("после завершения");
    else await expect(report.getByRole("alert")).toContainText("отсутствует среди результатов");
    expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
  });
}

test("подтипы учитывают доступность каждого вычислительного сценария", async ({ page }) => {
  const catalog = seabedKinds.map((item) => item.kind === "seabed_render" ? { ...item, available: false } : item);
  const observed = await mockSeabedFigures(page, [], seabedBuildJob, false, seabedOutputs, catalog);
  await page.goto("/lab/calculations?new=1");
  await chooseOption(page, "Что рассчитать", "Отчёты по модели дна");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.getByRole("combobox", { name: "Подтип отчёта" })).toHaveText("Поле размера ячеек");
  await dialog.getByRole("combobox", { name: "Подтип отчёта" }).click();
  await expect(page.getByRole("option", { name: "Обзор глубин · недоступен", exact: true })).toBeDisabled();
  await expect(page.getByRole("option", { name: "Фрагменты фактической сетки · недоступен", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("button", { name: "Запустить расчёт", exact: true })).toBeDisabled();
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

const boxKinds = [
  { kind: "dimension", title: "Размерность", description: "Полный закреплённый контур MarineRegions" },
  { kind: "dimension_dataset", title: "Своя береговая линия", description: "Сохранённый набор" },
  { kind: "dimension_file", title: "Размерность полного контура", description: "Научный GeoJSON" },
] satisfies CalculationKindDto[];
const boxInput: ScientificInputDto = { ...articleInputs[0], role: "coastline_geojson", name: "Контур для box-counting",
  filename: "coastline.geojson", crs: "EPSG:4326", coordinateUnit: "degrees", validation: checkedCoastline };

async function mockBoxCounting(page: Page, submissions: unknown[], original?: CalculationJobDto) {
  return mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations/kinds") return { body: boxKinds };
    if (path === "/api/datasets") return { body: [{ ...dataset, validation: checkedCoastline }] };
    if (path === "/api/scientific-inputs") return { body: [boxInput] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") { submissions.push(body); return { status: 201, body: job }; }
    if (path === `/api/calculations/${job.id}`) return { body: original ?? job };
  });
}

for (const [kind, title, theme] of [
  ["dimension", "Размерность", "light"], ["dimension", "Размерность", "dark"],
  ["dimension_dataset", "Своя береговая линия", "light"],
  ["dimension_file", "Размерность полного контура", "dark"],
] as const) {
  test(`box-counting: выбор отчёта сохраняет входы ${kind} · ${theme}`, async ({ page }) => {
    const submissions: unknown[] = [];
    const observed = await mockBoxCounting(page, submissions);
    await page.setViewportSize({ width: 360, height: 780 });
    await openNewCalculation(page, theme);
    await chooseOption(page, "Что рассчитать", title);
    const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
    if (kind === "dimension_dataset") {
      await dialog.getByRole("combobox", { name: "Набор данных" }).click();
      await page.getByRole("option", { name: new RegExp(dataset.name) }).click();
    } else if (kind === "dimension_file") {
      await dialog.locator("#scientific-coastlineInputId").click();
      await page.getByRole("option", { name: /Контур для box-counting/ }).click();
    }
    const picker = dialog.getByRole("combobox", { name: "Вид отчёта box-counting" });
    await expect(picker).toHaveText("Берег и аналитическая сетка");
    await picker.focus(); await picker.press("Enter");
    await expect(page.getByRole("option", { name: "Берег и аналитическая сетка", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "График регрессии", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(picker).toHaveText("График регрессии");
    await expect(picker).toBeFocused();
    if (kind === "dimension_dataset") await expect(dialog.getByLabel("Набор данных")).toContainText(dataset.name);
    if (kind === "dimension_file") await expect(dialog.locator("#scientific-coastlineInputId")).toContainText(boxInput.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    if (kind === "dimension") await page.screenshot({ path: `/private/tmp/litora-0079-${theme}-regression-form.png` });
    await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toEqual({ kind, input: { reportType: "box_counting_regression",
      ...(kind === "dimension_dataset" ? { datasetId: dataset.id } : {}),
      ...(kind === "dimension_file" ? { coastlineInputId: boxInput.id } : {}),
    } });
    expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
  });
}

for (const [reportType, title, filename] of [
  ["coastline_box_counting", "Берег и аналитическая сетка", "svg/dimension_0.svg"],
  ["box_counting_regression", "График регрессии", "svg/dimension_loglog_0.svg"],
] as const) {
  test(`box-counting: ${reportType} выделен, экспортируется и восстанавливается`, async ({ page }) => {
    const original = { ...job, kind: "dimension_file", status: "succeeded" as const,
      methodId: "box-counting", methodRevision: "reports-3", input: { coastlineInputId: boxInput.id, reportType },
      artifacts: ["svg/dimension_0.svg", "svg/dimension_loglog_0.svg"].map((name, i) => ({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, "0")}`, category: "output" as const,
        filename: name, contentType: "image/svg+xml", sha256: "a".repeat(64), sizeBytes: 200, downloadUrl: `/private/box-${i}.svg`,
      })),
    } satisfies CalculationJobDto;
    await page.route("**/private/box-*.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="teal"/></svg>' }));
    const submissions: unknown[] = [];
    const observed = await mockBoxCounting(page, submissions, original);
    await page.goto(`/lab/calculations/${job.id}`);
    const selected = page.getByRole("region", { name: `Выбранный отчёт: ${title}` });
    await expect(selected.getByRole("img")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Дополнительные визуальные отчёты", exact: true })).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(2);
    await expect(selected.getByRole("img")).toHaveAttribute("src", original.artifacts.find((file) => file.filename === filename)!.downloadUrl);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать паспорт JSON", exact: true }).click();
    const path = await (await downloading).path(); if (!path) throw new Error("Нет паспорта");
    const passport = JSON.parse(await readFile(path, "utf8")) as CalculationMetadataExportV1;
    expect(passport.calculation.input?.reportType).toBe(reportType);
    expect(passport.calculation.methodRevision).toBe("reports-3");
    await page.getByRole("link", { name: "Создать на основе", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Расчёт на основе", exact: true });
    await expect(dialog.getByRole("combobox", { name: "Вид отчёта box-counting" })).toHaveText(title);
    await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({ kind: "dimension_file", input: original.input });
    expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
  });
}

test("карты дна: недоступный источник не подменяется чужой или последней моделью", async ({ page }) => {
  const submissions: unknown[] = [];
  const observed = await mockSeabedFigures(page, submissions, seabedBuildJob, true);
  await page.goto(`/lab/calculations?new=1&workflow=bathymetry&source=${seabedBuildJob.id}`);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("Не удалось открыть исходный расчёт");
  await expect(dialog.locator("#scientific-modelInputId")).toHaveText("Выберите вход");
  await expect(dialog.getByRole("button", { name: "Запустить расчёт", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Выберите вход:");
  expect(submissions).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("карты дна: паспорт для карт выбирается из сборки модели, а не из другого задания", async ({ page }) => {
  const submissions: unknown[] = [];
  const adapted = { ...seabedBuildJob, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "seabed_adapt",
    input: { modelInputId: seabedOutputs[0].id, sourceMetadataInputId: seabedOutputs[2].id } };
  const unrelated = { ...seabedOutputs[1], id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", jobId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
  const observed = await mockSeabedFigures(page, submissions, adapted, false, [unrelated, ...seabedOutputs]);
  await page.goto(`/lab/calculations?new=1&workflow=bathymetry&source=${adapted.id}`);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.locator("#scientific-exportMetadataInputId")).not.toHaveText(/Выберите|Нет подходящих/);
  await dialog.getByRole("button", { name: "Запустить расчёт", exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({ kind: "seabed_render", input: {
    modelInputId: seabedOutputs[0].id, exportMetadataInputId: seabedOutputs[1].id, sourceMetadataInputId: seabedOutputs[2].id,
  } });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("карты дна: несколько плоских сеток требуют явного выбора", async ({ page }) => {
  const submissions: unknown[] = [];
  const meshed = { ...seabedBuildJob, kind: "mesh" };
  const outputs = [0, 1].map((index) => ({ ...seabedOutputs[index], role: "flat_mesh_msh" as const, jobKind: "mesh", filename: `mesh-${index}.msh` }));
  const observed = await mockSeabedFigures(page, submissions, meshed, false, outputs);
  await page.goto(`/lab/calculations?new=1&workflow=build&source=${meshed.id}`);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.locator("#scientific-flatMeshInputId")).toHaveText("Выберите вход");
  await expect(dialog.getByRole("button", { name: "Запустить расчёт", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Выберите вход: Плоская расчётная сетка MSH");
  expect(submissions).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("карты дна: отключённые heavy-сценарии остаются видимыми и не запускаются", async ({ page }) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds") return { body: [...kinds, ...seabedKinds.map((item) => ({ ...item, available: false, unavailableReason: "Тяжёлые расчёты отключены на сервере." }))] };
    if (path === "/api/datasets" || path === "/api/calculations") return { body: [] };
  });
  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await dialog.getByRole("combobox", { name: "Что рассчитать" }).click();
  await expect(page.getByRole("option", { name: "Отчёты по модели дна · недоступен", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("Тяжёлые расчёты отключены на сервере.", { exact: true })).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("карты дна: галерея подписывает реальные рисунки 3–5 и даёт переход к полю", async ({ page }) => {
  const filenames = ["seabed/svg/bathymetry-overview.svg", "seabed/svg/mesh-details.svg", "seabed/svg/size-field.svg"];
  const rendered = { ...seabedBuildJob, kind: "seabed_render", artifacts: filenames.map((filename, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`, category: "output" as const,
    filename, contentType: "image/svg+xml", sizeBytes: 256, sha256: "c".repeat(64), downloadUrl: `/private/${index}.svg`,
  })) } satisfies CalculationJobDto;
  await page.route("**/private/*.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="teal"/></svg>' }));
  const observed = await mockSeabedFigures(page, [], rendered);
  await page.goto(`/lab/calculations/${rendered.id}`);
  for (const title of ["Рисунок 3 · Обзор глубин", "Рисунок 4 · Поле размера ячеек", "Рисунок 5 · Фрагменты фактической сетки"]) {
    await expect(page.getByRole("img", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Новая сетка ещё не построена", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Рисунок 4 · Поле размера ячеек", exact: true }))
    .toHaveAttribute("href", `/lab/calculations?new=1&workflow=size-field&source=${rendered.id}`);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("принятая адаптивная MSH выбирается как вход модели дна", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  const adaptive = {
    id: "88888888-8888-4888-8888-888888888888",
    jobId: "99999999-9999-4999-8999-999999999999",
    jobKind: "seabed_generate_adaptive",
    role: "flat_mesh_msh",
    filename: "seabed/adaptive/gmsh/black-sea-adaptive.msh",
    sizeBytes: 210_000_000,
    sha256: "b".repeat(64),
    createdAt: "2026-10-11T12:00:00.000Z",
  } satisfies ReusableScientificArtifactDto;
  const buildInputs: ScientificInputDto[] = [
    {
      ...articleInputs[0],
      id: "77777777-7777-4777-8777-777777777771",
      role: "bathymetry_grid_json",
    },
    {
      ...articleInputs[1],
      id: "77777777-7777-4777-8777-777777777772",
      role: "bathymetry_grid_metadata_json",
    },
    articleInputs[5],
  ];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return {
        body: [
          {
            kind: "seabed_build",
            title: "Построить модель дна",
            description: "Тестовый сценарий",
          },
        ],
      };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: buildInputs };
    if (
      path === "/api/scientific-inputs/reusable-artifacts" &&
      method === "GET"
    )
      return { body: [adaptive] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: job };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: job };
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(
    dialog.getByText("Принятую MSH из «Построить адаптивную сетку»", {
      exact: false,
    })
  ).toBeVisible();
  await dialog.locator("#scientific-flatMeshInputId").click();
  await page.getByRole("option", { name: /black-sea-adaptive\.msh/ }).click();
  await expect(
    dialog.getByRole("link", { name: "Открыть исходный результат" })
  ).toHaveAttribute("href", `/lab/calculations/${adaptive.jobId}`);
  await dialog.locator("#scientific-bathymetryInputId").click();
  await page.getByRole("option", { name: /Архивный вход 1/ }).click();
  await dialog.locator("#scientific-bathymetryMetadataInputId").click();
  await page.getByRole("option", { name: /Архивный вход 2/ }).click();
  await dialog.locator("#scientific-coastlineInputId").click();
  await page.getByRole("option", { name: /Архивный вход 6/ }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  await dialog.locator("#build-maxSourceDistance").fill("50000");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({
    kind: "seabed_build",
    input: {
      flatMeshInputId: adaptive.id,
      bathymetryInputId: buildInputs[0].id,
      bathymetryMetadataInputId: buildInputs[1].id,
      coastlineInputId: buildInputs[2].id,
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("пресет рисунка 4 переносит точные параметры поля в запрос без выбора файлов", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  const observed = await mockArticleCalculations(page, submissions);
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "light");
  await expect(page.locator("html")).toHaveClass(/light/);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await dialog
    .getByRole("button", { name: "Архив статьи: поле 50–250 м" })
    .click();
  await expect(dialog.getByRole("region", { name: "3. Параметры" }).getByRole("status")).toContainText(
    "Параметры архивного поля 50–250 м заполнены"
  );
  await expect(
    dialog.getByText("пресет не выбирает файлы", { exact: false })
  ).toBeVisible();
  await expect(dialog.locator("#adapt-minSize")).toHaveValue("50");
  await expect(dialog.locator("#adapt-deepSize")).toHaveValue("250");
  await expect(dialog.locator("#adapt-maxSizeGradient")).toHaveValue("0.15");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  await selectArticleInput(page, "modelInputId", 0);
  await selectArticleInput(page, "sourceMetadataInputId", 1);
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toEqual({
    kind: "seabed_adapt",
    input: {
      modelInputId: articleInputs[0].id,
      sourceMetadataInputId: articleInputs[1].id,
      reportType: "size_field",
      minSize: 50,
      coastSize: 75,
      shelfSize: 125,
      deepSize: 250,
      coastInfluence: 25000,
      curvatureReference: 30,
      slopeReference: 10,
      flatDeepSlope: 1,
      maxNeighbourRatio: 1.25,
      maxSizeGradient: 0.15,
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("пресет рисунков 6–7 задаёт архивный уровень и не разрешает большой запуск", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  const observed = await mockArticleCalculations(page, submissions);
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await chooseOption(page, "Что рассчитать", "Сравнение сеток");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await dialog
    .getByRole("button", { name: "Заполнить как рисунки 6–7: сетки 125–250 м" })
    .click();
  await expect(dialog.getByRole("region", { name: "3. Параметры" }).getByRole("status")).toContainText(
    "Большой расчёт не разрешён автоматически"
  );
  await expect(
    dialog.getByText("значительных ресурсов", { exact: false })
  ).toBeVisible();
  await expect(dialog.locator("#compare-levels")).toHaveValue("coarse:125:250");
  await dialog
    .getByRole("checkbox", {
      name: "Подготовить экспертные SVG-карточки AI-01",
    })
    .check();
  await expect(
    dialog.getByText("Закрытый ключ организатора", { exact: false })
  ).toBeVisible();
  await dialog.locator("#expert-levels").fill("coarse");
  await dialog.locator("#expert-seed").fill("article_2026");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  await selectArticleInput(page, "modelInputId", 0);
  await selectArticleInput(page, "exportMetadataInputId", 2);
  await selectArticleInput(page, "fieldCsvInputId", 3);
  await selectArticleInput(page, "fieldReportInputId", 4);
  await selectArticleInput(page, "coastlineInputId", 5);
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toEqual({
    kind: "seabed_compare_adaptive",
    input: {
      modelInputId: articleInputs[0].id,
      exportMetadataInputId: articleInputs[2].id,
      fieldCsvInputId: articleInputs[3].id,
      fieldReportInputId: articleInputs[4].id,
      coastlineInputId: articleInputs[5].id,
      boundaryDetail: 50,
      generators: "delaunay,frontal-quad",
      levels: "coarse:125:250",
      detailPreset: "kizilirmak",
      maxCells: 25_000_000,
      allowLarge: false,
      generatorTimeoutMinutes: 20,
      generateExpertSet: true,
      expertLevels: "coarse",
      expertSeed: "article_2026",
    },
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("рисунок 5 собирается из AI-01 с выбранными уровнем и генератором", async ({
  page,
}) => {
  const submissions: unknown[] = [];
  const observed = await mockArticleCalculations(page, submissions);
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  await chooseOption(page, "Что рассчитать", "Сравнение сеток");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await dialog
    .getByRole("button", {
      name: "Компоновка AI-01: три фрагмента 125–250 м",
    })
    .click();
  await expect(dialog.getByRole("region", { name: "3. Параметры" }).getByRole("status")).toContainText(
    "Для рисунка 5 выбраны уровень coarse, Delaunay и карточки AI-01"
  );
  await expect(
    dialog.getByRole("checkbox", {
      name: "Подготовить экспертные SVG-карточки AI-01",
    })
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", {
      name: "Собрать рисунок 5 из трёх фактических карточек",
    })
  ).toBeChecked();
  await expect(dialog.locator("#figure-five-level")).toHaveValue("coarse");
  await expect(dialog.locator("#figure-five-generator")).toContainText(
    "delaunay"
  );
  await expect(
    dialog.getByRole("checkbox", {
      name: "Разрешить расчёт сверх лимита оценки ячеек после проверки ресурсов",
    })
  ).not.toBeChecked();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  for (const [field, index] of [
    ["modelInputId", 0],
    ["exportMetadataInputId", 2],
    ["fieldCsvInputId", 3],
    ["fieldReportInputId", 4],
    ["coastlineInputId", 5],
  ] as const)
    await selectArticleInput(page, field, index);
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  const submitted = submissions[0] as {
    kind: string;
    input: Record<string, unknown>;
  };
  expect(submitted.kind).toBe("seabed_compare_adaptive");
  expect(submitted.input).toMatchObject({
    levels: "coarse:125:250",
    generators: "delaunay,frontal-quad",
    generateExpertSet: true,
    expertLevels: "coarse",
    generateFigureFive: true,
    figureFiveLevel: "coarse",
    figureFiveGenerator: "delaunay",
    allowLarge: false,
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("рисунок 5 отображается как приватный SVG-артефакт расчёта", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const filename = "fig_05_actual_mesh_fragments.svg";
  const figureJob = {
    ...job,
    kind: "seabed_compare_adaptive",
    status: "succeeded" as const,
    artifacts: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        category: "output" as const,
        filename,
        contentType: "image/svg+xml",
        sizeBytes: 256,
        sha256: "e".repeat(64),
        downloadUrl: `/private/${filename}`,
      },
    ],
  } satisfies CalculationJobDto;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === `/api/calculations/${figureJob.id}` && method === "GET")
      return { body: figureJob };
  });
  const card = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="teal"/></svg>'
  ).toString("base64");
  await page.route(`**/private/${filename}`, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1800" height="760"><image xlink:href="data:image/svg+xml;base64,${card}" width="600" height="600"/></svg>`,
    })
  );
  await page.goto(`/lab/calculations/${figureJob.id}`);
  const preview = page.getByRole("img", { name: `Отчёт: ${filename}` });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth
      )
    )
    .toBe(1800);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("AI-01 сохраняется в паспорте и восстанавливается при повторе сравнения", async ({
  page,
}) => {
  const storedInput = {
    modelInputId: articleInputs[0].id,
    exportMetadataInputId: articleInputs[2].id,
    fieldCsvInputId: articleInputs[3].id,
    fieldReportInputId: articleInputs[4].id,
    coastlineInputId: articleInputs[5].id,
    boundaryDetail: 50,
    generators: "delaunay,frontal-quad",
    levels: "coarse:125:250",
    detailPreset: "kizilirmak",
    maxCells: 25_000_000,
    allowLarge: false,
    generatorTimeoutMinutes: 20,
    generateExpertSet: true,
    expertLevels: "coarse",
    expertSeed: "study_2026",
    generateFigureFive: true,
    figureFiveLevel: "coarse",
    figureFiveGenerator: "delaunay",
  };
  const stored = {
    ...job,
    kind: "seabed_compare_adaptive",
    status: "succeeded" as const,
    input: storedInput,
    inputSchemaVersion: 11,
  };
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return {
        body: [
          {
            kind: "seabed_compare_adaptive",
            title: "Сравнение сеток",
            description: "ADAPT-03",
          },
        ],
      };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: articleInputs };
    if (path === "/api/calculations" && method === "GET")
      return { body: [stored] };
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: stored };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: stored };
    }
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/lab/calculations/${job.id}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать паспорт JSON" }).click();
  const passport = JSON.parse(
    await readFile(await (await downloadPromise).path(), "utf8")
  ) as CalculationMetadataExportV1;
  expect(passport.calculation.input).toEqual(storedInput);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const repeat = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(
    repeat.getByRole("checkbox", {
      name: "Подготовить экспертные SVG-карточки AI-01",
    })
  ).toBeChecked();
  await expect(repeat.locator("#expert-levels")).toHaveValue("coarse");
  await expect(repeat.locator("#expert-seed")).toHaveValue("study_2026");
  await expect(
    repeat.getByRole("checkbox", {
      name: "Собрать рисунок 5 из трёх фактических карточек",
    })
  ).toBeChecked();
  await expect(repeat.locator("#figure-five-level")).toHaveValue("coarse");
  await repeat.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toEqual({
    kind: "seabed_compare_adaptive",
    input: storedInput,
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("AI-02 принимает шесть приватных входов, показывает решение Go и повторяет параметры", async ({
  page,
}) => {
  const aiRoles = [
    "expert_ratings_tsv",
    "expert_organizer_key_json",
    "adaptive_comparison_report_json",
    "seabed_msh",
    "export_metadata_json",
    "coastline_geojson",
  ] as const satisfies ScientificInputRole[];
  const aiInputs = aiRoles.map((role, index) => ({
    ...articleInputs[index],
    role,
    name: `AI вход ${index + 1}`,
  }));
  const storedInput = {
    ratingsInputId: aiInputs[0].id,
    organizerKeyInputId: aiInputs[1].id,
    comparisonReportInputId: aiInputs[2].id,
    modelInputId: aiInputs[3].id,
    exportMetadataInputId: aiInputs[4].id,
    coastlineInputId: aiInputs[5].id,
    minExpertsPerCard: 3,
    minTraining: 14,
    minEvaluation: 15,
    ridgeLambda: 0.5,
    minRmseImprovement: 0.2,
  };
  const stored = {
    ...job,
    kind: "seabed_assess_ml" as const,
    status: "succeeded" as const,
    input: storedInput,
    inputSchemaVersion: 12,
    resultSummary: {
      fileCount: 4,
      totalBytes: 2048,
      metrics: {
        "ai-necessity.json": {
          rating_row_count: 42,
          decision: {
            ml_recommended: false,
            training_record_count: 14,
            evaluation_record_count: 15,
            baseline_evaluation: { available: true, rmse: 1.2 },
            candidate_evaluation: { available: true, rmse: 1.1 },
            rmse_improvement: 0.0833,
            reasons: ["Улучшение недостаточно"],
          },
        },
      },
    },
  } satisfies CalculationJobDto;
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return {
        body: [
          {
            kind: "seabed_assess_ml",
            title: "Оценка необходимости ML",
            description: "AI-02",
          },
        ],
      };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: aiInputs };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { status: 201, body: stored };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: stored };
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  await chooseOption(page, "Что рассчитать", "Оценка необходимости ML");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  const fields = [
    "ratingsInputId",
    "organizerKeyInputId",
    "comparisonReportInputId",
    "modelInputId",
    "exportMetadataInputId",
    "coastlineInputId",
  ];
  for (const [index, field] of fields.entries()) {
    await dialog.locator(`#scientific-${field}`).click();
    await page
      .getByRole("option", { name: new RegExp(`AI вход ${index + 1}`) })
      .click();
  }
  await dialog.locator("#ai-minExpertsPerCard").fill("3");
  await dialog.locator("#ai-minTraining").fill("14");
  await dialog.locator("#ai-minEvaluation").fill("15");
  await dialog.locator("#ai-ridgeLambda").fill("0.5");
  await dialog.locator("#ai-minRmseImprovement").fill("0.2");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toEqual({
    kind: "seabed_assess_ml",
    input: storedInput,
  });
  await expect(
    page.getByRole("heading", { name: "Оценка необходимости ML · AI-02" })
  ).toBeVisible();
  await expect(
    page.getByText("ML не рекомендуется по заданным критериям")
  ).toBeVisible();
  await expect(
    page.getByText("Улучшение недостаточно", { exact: true })
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать паспорт JSON" }).click();
  const passport = JSON.parse(
    await readFile(await (await downloadPromise).path(), "utf8")
  ) as CalculationMetadataExportV1;
  expect(passport.calculation.input).toEqual(storedInput);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const repeat = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(repeat.locator("#ai-minExpertsPerCard")).toHaveValue("3");
  await expect(repeat.locator("#ai-minRmseImprovement")).toHaveValue("0.2");
  await repeat.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[1]).toEqual({
    kind: "seabed_assess_ml",
    input: storedInput,
  });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("QA-03 запускается с пятью входами, сохраняет параметры и повторяется в тёмной мобильной теме", async ({
  page,
}) => {
  const fullRoles = [
    "flat_mesh_msh",
    "mesh_comparison_report_json",
    "coastline_geojson",
    "bathymetry_grid_json",
    "bathymetry_grid_metadata_json",
  ] as const satisfies ScientificInputRole[];
  const fullInputs = fullRoles.map((role, index) => ({
    ...articleInputs[index],
    role,
  }));
  const submissions: { kind: string; input: Record<string, unknown> }[] = [];
  const created = {
    ...job,
    kind: "seabed_check_full",
    input: {},
    inputSchemaVersion: 10,
  };
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return {
        body: [
          {
            kind: "seabed_check_full",
            title: "Проверка полного контура",
            description: "QA-03",
          },
        ],
      };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: fullInputs };
    if (path === "/api/calculations" && method === "GET")
      return { body: submissions.length ? [created] : [] };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(
        body as { kind: string; input: Record<string, unknown> }
      );
      created.input = submissions.at(-1)?.input ?? {};
      return { status: 201, body: created };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: created };
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await openNewCalculation(page, "dark");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(
    dialog.getByText("Предел входной сетки в вебе — 256 МиБ", { exact: false })
  ).toBeVisible();
  for (const [index, field] of [
    "flatMeshInputId",
    "meshReportInputId",
    "coastlineInputId",
    "bathymetryInputId",
    "bathymetryMetadataInputId",
  ].entries())
    await selectArticleInput(page, field, index);
  await dialog.locator("#full-maxSourceDistance").fill("50000");
  await dialog.locator("#full-targetEdge").fill("900");
  await dialog.locator("#full-isobaths").fill("20,100,1000");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toEqual({
    kind: "seabed_check_full",
    input: {
      flatMeshInputId: fullInputs[0].id,
      meshReportInputId: fullInputs[1].id,
      coastlineInputId: fullInputs[2].id,
      bathymetryInputId: fullInputs[3].id,
      bathymetryMetadataInputId: fullInputs[4].id,
      generator: "frontal-quad",
      targetEdge: 900,
      boundaryDetail: 1000,
      maxSourceDistance: 50000,
      coastTransition: 0,
      isobaths: "20,100,1000",
      verticalExaggeration: 40,
      controlPoints: true,
    },
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать паспорт JSON" }).click();
  const passport = JSON.parse(
    await readFile(await (await downloadPromise).path(), "utf8")
  ) as CalculationMetadataExportV1;
  expect(passport.calculation.input).toEqual(submissions[0].input);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const repeat = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(repeat.locator("#full-targetEdge")).toHaveValue("900");
  await expect(repeat.locator("#full-isobaths")).toHaveValue("20,100,1000");
  await repeat.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[1]).toEqual(submissions[0]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("api-client запрашивает недоступные сценарии только явно", async () => {
  const urls: string[] = [];
  const client = createApiClient({ fetch: async (input) => {
    urls.push(String(input));
    return new Response("[]", { headers: { "content-type": "application/json" } });
  } });
  await client.calculationKinds();
  await client.calculationKinds({ includeUnavailable: true });
  await client.calculationKinds({ includeUnavailable: false });
  expect(urls.map((url) => new URL(url, "https://example.test").search)).toEqual([
    "", "?includeUnavailable=true", "?includeUnavailable=false",
  ]);
});

test("новая композиция: данные предшествуют параметрам CERC, готовность видна до запуска", async ({ page }) => {
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations/kinds") return { body: kinds };
    if (path === "/api/datasets" || path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") { submissions.push(body); return { body: job }; }
  });
  await openNewCalculation(page);
  await chooseOption(page, "Что рассчитать", "Эрозия по своим данным");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  expect(await dialog.getByRole("heading", { level: 3 }).allTextContents()).toEqual([
    "1. Тип расчёта", "2. Исходные данные", "3. Параметры", "4. Результат",
  ]);
  expect(await dialog.evaluate((element) => {
    const ids = Array.from(element.querySelectorAll("[id]"), (node) => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  })).toEqual([]);
  await expect(dialog.getByRole("region", { name: "2. Исходные данные" }).getByLabel("GeoJSON береговой линии или полного контура", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "3. Параметры" }).locator("#erosion-steps")).toHaveValue("3");
  expect(await dialog.locator("#erosion-steps").evaluate((input: HTMLInputElement) => input.form?.id)).toBe("new-calculation-form");
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText("Выберите вход:");
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Загрузить файл", exact: true }).first().click();
  await expect(dialog.getByRole("region", { name: "2. Исходные данные" }).locator("form")).toHaveCount(1);
  await expect(dialog.locator("form form")).toHaveCount(0);
  await chooseOption(page, "Что рассчитать", "Размерность");
  await expect(dialog.getByRole("region", { name: "2. Исходные данные" })).toContainText("MarineRegions");
  await expect(dialog.getByRole("region", { name: "3. Параметры" })).toContainText("нет дополнительных параметров");
  await expect(dialog.locator("#erosion-steps")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeEnabled();
  expect(submissions).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("новая композиция: сервер объясняет heavy в селекторе и блокирует недоступный повтор", async ({ page }) => {
  const reason = "Тяжёлые расчёты отключены на сервере. Доступность настраивает администратор.";
  let includesUnavailable = false;
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body, params) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations/kinds") {
      includesUnavailable ||= params.get("includeUnavailable") === "true";
      return { body: [kinds[0], { ...kinds[3], available: false, unavailableReason: reason }] };
    }
    if (path === "/api/datasets" || path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === `/api/calculations/${job.id}`) return { body: { ...job, kind: "erosion_file", input: { ...erosionFileDefaults, steps: 7 } } };
    if (path === "/api/calculations" && method === "POST") { submissions.push(body); return { body: job }; }
  });
  await page.goto(`/lab?repeat=${job.id}`);
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog.locator("#erosion-steps")).toHaveValue("7");
  await expect(dialog.locator("#erosion-steps")).toBeDisabled();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText(reason);
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  const helpTrigger = dialog.getByRole("button", { name: /^Справка о расчёте/ });
  await expect(helpTrigger).toBeEnabled();
  await helpTrigger.click();
  const help = page.getByRole("dialog", { name: /^Справка:/ });
  await expect(help.getByText("Ваш локальный контур, волновой ряд CSV/JSON", { exact: false })).toBeVisible();
  await expect(help.getByRole("button", { name: "Закрыть справку" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(helpTrigger).toBeFocused();
  await expect(dialog.getByRole("region", { name: "4. Результат" })).toContainText(reason);
  await helpTrigger.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Расчёт на основе", includeHidden: true })).toHaveCount(1);
  if (await help.count() > 0) await help.getByRole("button", { name: "Закрыть справку" }).click();
  await expect(helpTrigger).toBeFocused();
  await dialog.getByLabel("Что рассчитать").click();
  await expect(page.getByRole("option", { name: "Эрозия по своим данным · недоступен", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(includesUnavailable).toBe(true);
  expect(submissions).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("форма запускает только сценарий, предложенный API", async ({ page }) => {
  const submissions: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: [kinds.find((item) => item.kind === "map")] };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      submissions.push(body);
      return { body: { ...job, kind: "map" } };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: { ...job, kind: "map" } };
  });

  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.getByLabel("Что рассчитать")).toContainText("Карта");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${job.id}$`));
  expect(submissions).toEqual([{ kind: "map", input: {} }]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("пустой каталог сценариев не позволяет создать расчёт", async ({
  page,
}) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: [] };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(
    dialog.getByText("Сейчас нет доступных сценариев для запуска.")
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Справка о расчёте/ })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Запустить расчёт" })
  ).toBeDisabled();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("ошибка каталога остаётся в форме, справка появляется после успешной загрузки", async ({ page }) => {
  let failed = true;
  const observed = await mockApi(page, (path) => {
    if (path === "/api/auth/refresh") return { body: session };
    if (path === "/api/calculations/kinds") return failed
      ? { status: 503, body: { message: "Каталог временно недоступен" } }
      : { body: [kinds[0]] };
    if (["/api/calculations", "/api/datasets"].includes(path)) return { body: [] };
  });
  await openNewCalculation(page);
  const dialog = page.getByRole("dialog", { name: "Новый расчёт", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("Каталог временно недоступен");
  await expect(dialog.getByRole("button", { name: /^Справка о расчёте/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  failed = false;
  await dialog.getByRole("button", { name: "Повторить загрузку", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Справка о расчёте «Размерность»", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Справка: Размерность", exact: true })).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("история листается сервером и сохраняет безопасные фильтры в URL", async ({
  page,
}) => {
  const older = {
    ...job,
    id: "44444444-4444-4444-8444-444444444444",
    kind: "map",
    status: "succeeded",
  } satisfies CalculationJobDto;
  const newest = {
    ...job,
    id: "55555555-5555-4555-8555-555555555555",
    kind: "dimension",
    status: "succeeded",
  } satisfies CalculationJobDto;
  const firstPage = [
    newest,
    ...Array.from({ length: 19 }, (_, index) => ({
      ...job,
      id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`,
    })),
  ];
  let olderPageRequests = 0;
  const observed = await mockApi(page, (path, method, _body, params) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations/page" && method === "GET") {
      if (params.get("status") === "succeeded")
        return {
          body: { items: [newest, older], nextCursor: null, totalCount: 2 },
        };
      if (params.get("cursor") === "older-page") {
        olderPageRequests++;
        return {
          body: {
            items: [firstPage[19], older],
            nextCursor: null,
            totalCount: 21,
          },
        };
      }
      return {
        body: { items: firstPage, nextCursor: "older-page", totalCount: 21 },
      };
    }
  });

  await page.goto("/lab/calculations");
  await expect(page.getByText("Найдено расчётов: 21")).toBeVisible();
  const history = page.getByRole("region", { name: "История расчётов" });
  await expect(
    history.getByRole("table", { name: "История расчётов" }).locator("tbody tr")
  ).toHaveCount(20);
  await page
    .getByRole("button", { name: "Загрузить ещё" })
    .scrollIntoViewIfNeeded();
  await expect(history.getByRole("table").locator("tbody tr")).toHaveCount(21);
  expect(olderPageRequests).toBe(1);
  await expect(page).not.toHaveURL(/cursor=/);
  await history
    .getByRole("checkbox", { name: /Сравнить расчёт Размерность/ })
    .check();
  await history
    .getByRole("checkbox", { name: /Сравнить расчёт Карта/ })
    .check();
  await expect(
    page.getByRole("button", { name: "Сравнить отчёты" })
  ).toBeEnabled();
  await chooseOption(page, "Статус", "Завершён");
  await expect(page).toHaveURL(/status=succeeded/);
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(page.getByText("Найдено расчётов: 2")).toBeVisible();
  await expect(history.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Сравнить отчёты" })
  ).toHaveCount(0);
  await chooseOption(page, "Загружать по", "10");
  await expect(page).toHaveURL(/limit=10/);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(
    "/lab/calculations?from=2026-10-01&to=2026-10-31&cursor=older-page"
  );
  await chooseTheme(page, "dark");
  const searchWidth = await page
    .getByLabel("Поиск по UUID расчёта")
    .evaluate((input) => input.getBoundingClientRect().width);
  expect(searchWidth).toBeGreaterThan(240);
  const fromDate = page.getByRole("button", { name: /С даты, UTC: 1 октября/ });
  await fromDate.click();
  const datePicker = page.getByRole("dialog", { name: "С даты, UTC" });
  await expect(datePicker).toBeVisible();
  const selectedDay = datePicker.getByRole("button", {
    name: /^четверг, 1 октября 2026/,
  });
  await expect(selectedDay).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    datePicker.getByRole("button", { name: /^пятница, 2 октября 2026/ })
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  await page.keyboard.press("Escape");
  await expect(datePicker).toBeHidden();
  await expect(fromDate).toBeFocused();
  await fromDate.click();
  await datePicker.getByRole("button", { name: /15 октября 2026/ }).click();
  await expect(page).toHaveURL(/from=2026-10-15/);
  await expect(page).not.toHaveURL(/cursor=/);
  await page.getByRole("button", { name: /По дату, UTC: 31 октября/ }).click();
  const toDatePicker = page.getByRole("dialog", { name: "По дату, UTC" });
  await toDatePicker.getByRole("button", { name: "Очистить дату" }).click();
  await expect(page).not.toHaveURL(/to=/);
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page).toHaveURL(/\/lab\/calculations$/);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("история различает ожидание worker, повтор ошибки и завершение удаления", async ({
  page,
}) => {
  const requestId = "77777777-7777-4777-8777-777777777777";
  const request = {
    id: requestId,
    scope: "single",
    requestedCount: 1,
    deletedCount: 0,
    retryingCount: 0,
    status: "pending",
    createdAt: "2026-10-14T08:00:00.000Z",
  } satisfies CalculationDeletionRequestDto;
  let checks = 0;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations/page" && method === "GET")
      return {
        body: {
          items:
            checks >= 2
              ? []
              : [
                  {
                    ...job,
                    status: "succeeded",
                    deletionRequestedAt: request.createdAt,
                  },
                ],
          nextCursor: null,
          totalCount: checks >= 2 ? 0 : 1,
        },
      };
    if (path === "/api/calculations/deletions-current" && method === "GET")
      return { body: request };
    if (
      path === `/api/calculations/deletions/${requestId}` &&
      method === "GET"
    ) {
      checks++;
      return {
        body:
          checks === 1
            ? { ...request, status: "retrying", retryingCount: 1 }
            : { ...request, status: "completed", deletedCount: 1 },
      };
    }
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/lab/calculations");
  await expect(
    page.getByText("Удаление поставлено в очередь worker.", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByText("Если прогресс долго не меняется", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByText("Удаление отложено; worker повторит попытку.", {
      exact: false,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Ошибок обработки: 1.", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByText("Удаление завершено.", { exact: false })
  ).toBeVisible();
  await expect(page.getByText("Найдено расчётов: 0")).toBeVisible();
  await expect(
    page.getByText("Пока нет расчётов.", { exact: false })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("ошибка подгрузки истории не теряет строки и допускает повтор", async ({
  page,
}) => {
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    ...job,
    id: `88888888-8888-4888-8888-${String(index).padStart(12, "0")}`,
  }));
  const older = {
    ...job,
    id: "99999999-9999-4999-8999-999999999999",
    status: "succeeded",
  } satisfies CalculationJobDto;
  let attempts = 0;
  const observed = await mockApi(page, (path, method, _body, params) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations/page" && method === "GET") {
      if (params.get("cursor") === "next-page") {
        attempts++;
        return attempts === 1
          ? { status: 503, body: { message: "Сервис временно недоступен" } }
          : { body: { items: [older], nextCursor: null, totalCount: 21 } };
      }
      return {
        body: { items: firstPage, nextCursor: "next-page", totalCount: 21 },
      };
    }
  });

  await page.goto("/lab/calculations");
  const history = page.getByRole("region", { name: "История расчётов" });
  await expect(history.getByRole("table").locator("tbody tr")).toHaveCount(20);
  await page
    .getByRole("button", { name: "Загрузить ещё" })
    .scrollIntoViewIfNeeded();
  await expect(history.getByRole("alert")).toContainText(
    "Не удалось загрузить ещё расчёты"
  );
  await expect(history.getByRole("table").locator("tbody tr")).toHaveCount(20);
  expect(attempts).toBe(1);
  await history.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(history.getByRole("table").locator("tbody tr")).toHaveCount(21);
  await expect(
    history.getByText("Это все расчёты по выбранным условиям.")
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("форма отдельно повторяет загрузку сценариев и наборов", async ({
  page,
}) => {
  let datasetRequests = 0;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") {
      datasetRequests++;
      return datasetRequests <= 2
        ? { status: 503, body: { message: "Наборы временно недоступны" } }
        : { body: [] };
    }
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await openNewCalculation(page);
  await expect(page.getByRole("alert")).toContainText(
    "Наборы временно недоступны"
  );
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(page.getByLabel("Что рассчитать")).toBeEnabled();
  expect(datasetRequests).toBeGreaterThanOrEqual(3);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("кабинет требует вход; регистрация требует одноразовый ключ", async ({
  page,
}) => {
  const registrations: unknown[] = [];
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { status: 401, body: { message: "Нет сессии" } };
    if (path === "/api/auth/register" && method === "POST") {
      registrations.push(body);
      return { body: session };
    }
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await page.goto("/lab");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" })
    .click();
  await page.getByLabel("Имя").fill(user.name);
  await page.getByLabel("Почта").fill(user.email);
  await page.getByLabel("Пароль", { exact: true }).fill("secret-password-123");
  const invitation = page.getByLabel("Ключ приглашения");
  await invitation.focus();
  await invitation.press("Tab");
  await expect(
    page.getByRole("button", { name: "Зарегистрироваться" })
  ).toBeFocused();
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(invitation).toBeFocused();
  expect(registrations).toHaveLength(0);

  await invitation.fill("LITORA-TEST-INVITATION");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(
    page.getByText("Лаборатория · Тестовый исследователь")
  ).toBeVisible();
  expect(registrations).toEqual([
    {
      name: user.name,
      email: user.email,
      password: "secret-password-123",
      invitationCode: "LITORA-TEST-INVITATION",
    },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("ошибка входа видна; повторный вход открывает кабинет", async ({
  page,
}) => {
  let attempts = 0;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { status: 401, body: { message: "Нет сессии" } };
    if (path === "/api/auth/login" && method === "POST") {
      attempts++;
      return attempts === 1
        ? { status: 401, body: { message: "Неверная почта или пароль" } }
        : { body: session };
    }
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await page.goto("/login");
  await page.getByLabel("Почта").fill(user.email);
  await page.getByLabel("Пароль", { exact: true }).fill("secret-password-123");
  await page
    .locator("form")
    .getByRole("button", { name: "Войти", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Неверная почта или пароль"
  );
  await expect(page).toHaveURL(/\/login$/);
  await page
    .locator("form")
    .getByRole("button", { name: "Войти", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("кабинет показывает ошибку расчёта и позволяет повторить запуск", async ({
  page,
}) => {
  const requests: unknown[] = [];
  let created = false;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET")
      return { body: created ? [job] : [] };
    if (path === "/api/calculations" && method === "POST") {
      requests.push(body);
      if (requests.length === 1)
        return {
          status: 503,
          body: { message: "Вычислитель временно недоступен" },
        };
      created = true;
      return { status: 201, body: job };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: job };
  });

  await openNewCalculation(page);
  await chooseOption(page, "Что рассчитать", "Размерность");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Вычислитель временно недоступен"
  );
  await expect(page.getByRole("alert")).toContainText("Параметры сохранены");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${job.id}$`));
  await expect(
    page.getByRole("region", { name: "Результат расчёта" })
  ).toContainText(job.id);
  expect(requests).toEqual([
    { kind: "dimension", input: { reportType: "coastline_box_counting" } },
    { kind: "dimension", input: { reportType: "coastline_box_counting" } },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("загрузка своего GeoJSON и запуск dimension через UUID набора", async ({
  page,
}) => {
  const uploads: unknown[] = [];
  const jobs: unknown[] = [];
  const customJob = {
    ...job,
    kind: "dimension_dataset",
    input: { datasetId: dataset.id, downloadUrl: "input-secret" },
  };
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") {
      uploads.push(body);
      return { status: 201, body: dataset };
    }
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      jobs.push(body);
      return { status: 201, body: customJob };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: customJob };
  });

  await openNewCalculation(page);
  await chooseOption(page, "Что рассчитать", "Своя береговая линия");
  await page.getByRole("button", { name: "Загрузить GeoJSON" }).click();
  await page.getByLabel("Файл GeoJSON").setInputFiles({
    name: "coast.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "LineString",
        coordinates: [
          [39.66, 43.64],
          [39.67, 43.63],
          [39.68, 43.62],
        ],
      })
    ),
  });
  await page.getByLabel("Название").fill(dataset.name);
  await page.getByLabel("Источник данных").fill(dataset.source);
  await page
    .getByLabel("Лицензия или условия использования")
    .fill(dataset.license);
  await page.getByRole("button", { name: "Сохранить набор" }).click();
  await expect(page.getByLabel("Что рассчитать")).toContainText(
    "Своя береговая линия"
  );
  await expect(page.getByLabel("Набор данных")).toContainText(dataset.name);
  await chooseOption(
    page,
    "Набор данных",
    "Встроенный пример Сочи (по умолчанию)"
  );
  await expect(page.getByLabel("Набор данных")).toContainText(
    "Встроенный пример Сочи"
  );
  await chooseOption(
    page,
    "Набор данных",
    `${dataset.name} · ${dataset.pointCount} точек`
  );
  await expect(page.getByLabel("Набор данных")).toContainText(dataset.name);
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(
    page.getByRole("region", { name: "Результат расчёта" })
  ).toContainText(job.id);
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatchObject({
    name: dataset.name,
    source: dataset.source,
    license: dataset.license,
    crs: "EPSG:4326",
    coordinateUnit: "degrees",
    geometry: {
      type: "LineString",
      coordinates: [
        [39.66, 43.64],
        [39.67, 43.63],
        [39.68, 43.62],
      ],
    },
  });
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: dataset.id, reportType: "coastline_box_counting" } },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("встроенный пример GeoJSON сохраняется при запуске", async ({ page }) => {
  const uploads: unknown[] = [];
  const jobs: unknown[] = [];
  const example = { ...dataset, name: defaultCoastlineDataset.name };
  const customJob = {
    ...job,
    kind: "dimension_dataset",
    input: { datasetId: example.id },
  };
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") {
      uploads.push(body);
      return { status: 201, body: example };
    }
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      jobs.push(body);
      return { status: 201, body: customJob };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: customJob };
  });

  await openNewCalculation(page);
  await chooseOption(page, "Что рассчитать", "Своя береговая линия");
  await expect(
    page.getByText("Пример Сочи (OpenStreetMap, ODbL)", { exact: false })
  ).toBeVisible();
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${job.id}$`));

  expect(uploads).toEqual([defaultCoastlineDataset]);
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: example.id, reportType: "coastline_box_counting" } },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("повторный расчёт использует переименованный пример Сочи без новой записи", async ({
  page,
}) => {
  const example = {
    ...savedExample(defaultCoastlineExample, "77777777-7777-4777-8777-777777777774"),
    name: "Мой участок Сочи",
  };
  const copy = { ...example, id: "77777777-7777-4777-8777-777777777775" };
  const jobs: unknown[] = [];
  const customJob = {
    ...job,
    kind: "dimension_dataset",
    input: { datasetId: example.id },
  };
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET")
      return { body: [example, copy] };
    if (path === "/api/scientific-inputs" && method === "GET")
      return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      jobs.push(body);
      return { status: 201, body: customJob };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: customJob };
  });

  await openNewCalculation(page);
  await chooseOption(page, "Что рассчитать", "Своя береговая линия");
  await expect(
    page.getByText("уже сохранён и будет использован повторно", {
      exact: false,
    })
  ).toBeVisible();
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${job.id}$`));
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: example.id, reportType: "coastline_box_counting" } },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("расчёт своего контура без загруженного файла автоматически берёт GeoJSON Сочи", async ({
  page,
}) => {
  const uploads: unknown[] = [];
  const jobs: unknown[] = [];
  const example = { ...dataset, name: defaultCoastlineDataset.name };
  const customJob = {
    ...job,
    kind: "dimension_dataset",
    input: { datasetId: example.id },
  };
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") {
      uploads.push(body);
      return { status: 201, body: example };
    }
    if (path === "/api/calculations" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "POST") {
      jobs.push(body);
      return { status: 201, body: customJob };
    }
    if (path === `/api/calculations/${job.id}` && method === "GET")
      return { body: customJob };
  });

  await openNewCalculation(page);
  await chooseOption(page, "Что рассчитать", "Своя береговая линия");
  await expect(page.getByLabel("Набор данных")).toContainText(
    "Встроенный пример Сочи"
  );
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${job.id}$`));
  await expect(
    page.getByRole("region", { name: "Результат расчёта" })
  ).toContainText(job.id);
  expect(uploads).toEqual([defaultCoastlineDataset]);
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: example.id, reportType: "coastline_box_counting" } },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("отмена расчёта требует подтверждения и сохраняет историю", async ({
  page,
}) => {
  let cancelled = false;
  let cancelRequests = 0;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations" && method === "GET")
      return { body: [{ ...job, status: cancelled ? "cancelled" : "queued" }] };
    if (path === `/api/calculations/${job.id}/cancel` && method === "POST") {
      cancelRequests++;
      cancelled = true;
      return { status: 201, body: { ...job, status: "cancelled" } };
    }
  });

  await page.goto("/lab/calculations");
  const cancelTrigger = page.getByRole("button", {
    name: "Отменить",
    exact: true,
  });
  await cancelTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Отменить расчёт?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cancelTrigger).toBeFocused();
  expect(cancelRequests).toBe(0);

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Закрыть окно отмены расчёта" })
    .click();
  await expect(dialog).toBeHidden();
  expect(cancelRequests).toBe(0);

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Отменить расчёт", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("region", { name: "История расчётов" }).getByText("Отменён")
  ).toBeVisible();
  expect(cancelRequests).toBe(1);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("реестр открывает краткий просмотр и сопоставляет два совместимых отчёта", async ({
  page,
}) => {
  const firstReport = {
    ...job,
    status: "succeeded" as const,
    resultSummary: { area: 12.5 },
    resultSchemaVersion: 1,
    artifacts: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        category: "output",
        filename: "comparison.svg",
        contentType: "image/svg+xml",
        sizeBytes: 128,
        sha256: "a".repeat(64),
        downloadUrl: "/private/compare-expired.svg",
      },
    ],
  };
  const secondReport = {
    ...firstReport,
    id: "44444444-4444-4444-8444-444444444444",
    resultSummary: { area: 14.75 },
    artifacts: [],
  };
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations" && method === "GET")
      return { body: [firstReport, secondReport] };
    if (path === `/api/calculations/${firstReport.id}` && method === "GET")
      return { body: firstReport };
    if (path === `/api/calculations/${secondReport.id}` && method === "GET")
      return { body: secondReport };
  });
  await page.route("**/private/compare-expired.svg", (route) =>
    route.fulfill({ status: 403, body: "Ссылка истекла" })
  );

  await page.goto("/lab/calculations");
  const quickTrigger = page
    .getByRole("button", { name: "Кратко", exact: true })
    .first();
  await quickTrigger.click();
  const quickView = page.getByRole("dialog", { name: "Размыв" });
  await expect(quickView).toContainText("Опубликовано файлов: 1.");
  await quickView
    .getByRole("button", { name: "Закрыть краткий просмотр" })
    .click();
  await expect(quickView).toBeHidden();
  await expect(quickTrigger).toBeFocused();

  const compareControls = page.getByRole("checkbox", {
    name: /Сравнить расчёт/,
  });
  await compareControls.nth(0).check();
  await compareControls.nth(1).check();
  const comparisonTrigger = page.getByRole("button", {
    name: "Сравнить отчёты",
    exact: true,
  });
  await comparisonTrigger.click();
  const comparison = page.getByRole("dialog", { name: "Сравнение отчётов" });
  await expect(comparison).toContainText("Отчёт A");
  await expect(comparison).toContainText("Отчёт B");
  await expect(comparison.getByRole("alert")).toContainText(
    "Откройте полный отчёт, чтобы обновить ссылки"
  );
  await comparison
    .getByRole("button", { name: "Закрыть сравнение отчётов" })
    .click();
  await expect(comparison).toBeHidden();
  await expect(comparisonTrigger).toBeFocused();

  await page.setViewportSize({ width: 640, height: 400 });
  await chooseTheme(page, "dark");
  await comparisonTrigger.click();
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByRole("heading", { name: "Сравнение отчётов" })
  ).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(640);
  const comparisonBounds = await comparison.boundingBox();
  expect(comparisonBounds).not.toBeNull();
  expect(comparisonBounds!.x).toBeGreaterThanOrEqual(0);
  expect(comparisonBounds!.x + comparisonBounds!.width).toBeLessThanOrEqual(
    640
  );
  expect(comparisonBounds!.y).toBeGreaterThanOrEqual(0);
  expect(comparisonBounds!.y + comparisonBounds!.height).toBeLessThanOrEqual(
    400
  );
  await comparison.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => comparison.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(comparison).toBeHidden();
  await expect(comparisonTrigger).toBeFocused();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("полный паспорт показывает происхождение и не смешивает расчёты при переходе", async ({
  page,
}) => {
  const first = {
    ...job,
    kind: "dimension_dataset",
    status: "succeeded" as const,
    input: { datasetId: dataset.id },
    resultSummary: {
      fileCount: 1,
      totalBytes: 256,
      metrics: {
        "dimension.json": { dimension: 1.25, accessToken: "metric-secret" },
      },
      provenance: {
        datasetId: dataset.id,
        datasetSchemaVersion: 1,
        source: "Локальная съёмка",
        sourceRevision: "2026-09",
        license: "Тестовое использование",
        crs: "EPSG:4326",
        coordinateUnit: "degrees",
        pointCount: 3,
        sha256: "a".repeat(64),
        files: [
          {
            path: "/private/worker/input.geojson",
            sizeBytes: 78,
            sha256: "a".repeat(64),
          },
        ],
      },
    },
    resultSchemaVersion: 1,
    coreVersion: `sha256:${"b".repeat(64)}`,
    commandLine: "/private/worker secret-command",
    methodId: "box-counting",
    methodRevision: "baseline-1",
    finishedAt: "2026-09-29T12:03:00.000Z",
    artifacts: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        category: "output",
        filename: "dimension.json",
        contentType: "application/json",
        sizeBytes: 256,
        sha256: "c".repeat(64),
        downloadUrl: "https://example.test/signed-output?signature=secret",
      },
    ],
  } satisfies CalculationJobDto;
  const second = {
    ...job,
    id: "66666666-6666-4666-8666-666666666666",
    input: {
      ...erosionDemoDefaults,
      steps: 4,
      cercCoefficient: 0.5,
      outputCsv: true,
      csvFormat: "wide" as const,
      accessToken: "input-secret",
    },
  } satisfies CalculationJobDto;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === `/api/calculations/${first.id}` && method === "GET")
      return { body: first };
    if (path === `/api/calculations/${second.id}` && method === "GET")
      return { body: second };
  });
  await page.route(`**/api/calculations/${second.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(second),
    });
  });

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/lab/calculations/${first.id}`);
  await chooseTheme(page, "light");
  await expect(page.locator("html")).toHaveClass(/light/);
  const detail = page.getByRole("region", { name: "Результат расчёта" });
  await expect(detail).toContainText("Локальная съёмка");
  await expect(detail).toContainText("box-counting");
  await expect(detail).toContainText("baseline-1");
  await expect(detail).toContainText("input.geojson");
  await expect(detail).toContainText("c".repeat(64));
  await expect(detail).not.toContainText("signed-output");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);

  const exportButton = detail.getByRole("button", {
    name: "Скачать паспорт JSON",
  });
  await exportButton.focus();
  await expect(exportButton).toBeFocused();
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `litora-calculation-${first.id}-metadata-v1.json`
  );
  const exportedText = await readFile(await download.path(), "utf8");
  const exported = JSON.parse(exportedText) as CalculationMetadataExportV1;
  expect(exported).toMatchObject({
    format: "litora.calculation-metadata",
    schemaVersion: 1,
    calculation: {
      id: first.id,
      kind: "dimension_dataset",
      input: { datasetId: dataset.id },
      inputSchemaVersion: 1,
      resultSchemaVersion: 1,
      coreVersion: first.coreVersion,
      methodId: "box-counting",
      methodRevision: "baseline-1",
    },
    provenance: {
      dataset: {
        id: dataset.id,
        source: "Локальная съёмка",
        sha256: "a".repeat(64),
      },
      inputFiles: [{ sizeBytes: 78, sha256: "a".repeat(64) }],
    },
    artifacts: [
      {
        id: first.artifacts[0].id,
        filename: "dimension.json",
        sizeBytes: 256,
        sha256: "c".repeat(64),
      },
    ],
  });
  expect(Object.keys(exported.artifacts[0]).sort()).toEqual([
    "category",
    "contentType",
    "filename",
    "id",
    "sha256",
    "sizeBytes",
  ]);
  for (const secret of [
    "signed-output",
    "input-secret",
    "metric-secret",
    "secret-command",
    "/private/worker",
    session.accessToken,
  ]) {
    expect(exportedText).not.toContain(secret);
  }

  await page.evaluate((id) => {
    window.history.pushState({}, "", `/lab/calculations/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, second.id);
  await expect(detail).toContainText("Загружаем расчёт…");
  await expect(detail).not.toContainText("Локальная съёмка");
  await expect(detail).toContainText(second.id);
  await expect(detail).toContainText("Демонстрационный сценарий");
  await expect(detail).toContainText(
    "Происхождение входных файлов не записано"
  );
  await chooseTheme(page, "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const secondDownloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const secondDownload = await secondDownloadPromise;
  const secondExport = JSON.parse(
    await readFile(await secondDownload.path(), "utf8")
  ) as CalculationMetadataExportV1;
  expect(secondExport.calculation).toMatchObject({
    id: second.id,
    input: {
      ...erosionDemoDefaults,
      steps: 4,
      cercCoefficient: 0.5,
      outputCsv: true,
      csvFormat: "wide",
    },
    coreVersion: null,
    resultSchemaVersion: null,
  });
  expect(JSON.stringify(secondExport)).not.toContain("input-secret");
  expect(secondExport.provenance).toBeNull();
  expect(secondExport.artifacts).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("Тестовая ошибка подготовки файла");
    };
  });
  await exportButton.click();
  await expect(detail.getByRole("alert")).toContainText(
    "Не удалось подготовить паспорт"
  );

  let releaseFirst = () => {};
  const heldFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstSettled = () => {};
  const firstSettled = new Promise<void>((resolve) => {
    markFirstSettled = resolve;
  });
  await page.route(`**/api/calculations/${first.id}`, async (route) => {
    await heldFirst;
    try {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(first),
      });
    } finally {
      markFirstSettled();
    }
  });
  const oldRequest = page.waitForRequest(`**/api/calculations/${first.id}`);
  await page.evaluate((id) => {
    window.history.pushState({}, "", `/lab/calculations/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, first.id);
  await oldRequest;
  await page.evaluate((id) => {
    window.history.pushState({}, "", `/lab/calculations/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, second.id);
  await expect(detail).toContainText(second.id);
  releaseFirst();
  await firstSettled;
  await expect(detail).not.toContainText("Локальная съёмка");
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("экспорт старого расчёта не подменяет неизвестный вход и не выдаёт пути", async ({
  page,
}) => {
  const legacy = {
    ...job,
    id: "abababab-abab-4bab-8bab-abababababab",
    kind: "legacy",
    status: "succeeded" as const,
    input: { unknownParameter: "input-secret" },
    resultSummary: {
      provenance: { files: [{ path: "/private/worker/secret-input" }] },
      metrics: { token: "metric-secret" },
    },
    commandLine: "/private/worker/secret-command",
  } satisfies CalculationJobDto;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === `/api/calculations/${legacy.id}` && method === "GET")
      return { body: legacy };
  });
  await page.goto(`/lab/calculations/${legacy.id}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать паспорт JSON" }).click();
  const download = await downloadPromise;
  const content = await readFile(await download.path(), "utf8");
  const exported = JSON.parse(content) as CalculationMetadataExportV1;
  expect(exported.calculation.input).toBeNull();
  expect(exported.provenance).toBeNull();
  for (const secret of ["input-secret", "metric-secret", "/private/worker"]) {
    expect(content).not.toContain(secret);
  }
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("предпросмотр изображения восстанавливается после обновления временной ссылки", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const preview = {
    id: "77777777-7777-4777-8777-777777777777",
    category: "output",
    filename: "report.svg",
    contentType: "image/svg+xml",
    sizeBytes: 128,
    sha256: "d".repeat(64),
    downloadUrl: "/private/report-old.svg",
  };
  const initial = {
    ...job,
    kind: "dimension",
    status: "succeeded" as const,
    artifacts: [
      preview,
      {
        ...preview,
        id: "88888888-8888-4888-8888-888888888888",
        category: "log",
        filename: "journal.svg",
        downloadUrl: "/private/journal.svg",
      },
      {
        ...preview,
        id: "99999999-9999-4999-8999-999999999999",
        filename: "unsafe.html",
        contentType: "text/html",
        downloadUrl: "/private/unsafe.html",
      },
    ],
  } satisfies CalculationJobDto;
  let detailRequests = 0;
  let returnNewUrl = false;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === `/api/calculations/${initial.id}` && method === "GET") {
      detailRequests++;
      return {
        body: returnNewUrl
          ? {
              ...initial,
              artifacts: initial.artifacts.map((file) =>
                file.id === preview.id
                  ? { ...file, downloadUrl: "/private/report-new.svg" }
                  : file
              ),
            }
          : initial,
      };
    }
  });
  let oldImageRequests = 0;
  let newImageRequests = 0;
  let releaseOldImage = () => {};
  const heldOldImage = new Promise<void>((resolve) => {
    releaseOldImage = resolve;
  });
  await page.route("**/private/report-old.svg", async (route) => {
    oldImageRequests++;
    await heldOldImage;
    await route.fulfill({ status: 403, body: "Ссылка истекла" });
  });
  await page.route("**/private/report-new.svg", (route) => {
    newImageRequests++;
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="teal"/></svg>',
    });
  });

  await page.goto(`/lab/calculations/${initial.id}`, {
    waitUntil: "domcontentloaded",
  });
  await chooseTheme(page, "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const detail = page.getByRole("region", { name: "Результат расчёта" });
  const visual = page.getByRole("region", { name: "Визуальные отчёты" });
  await expect(visual.locator("figure")).toHaveCount(1);
  await visual.scrollIntoViewIfNeeded();
  await expect(visual.getByRole("status")).toContainText(
    "Загружаем изображение"
  );
  releaseOldImage();
  await expect(visual.getByRole("alert")).toContainText(
    "ссылка устарела или файл отсутствует"
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(360);
  await expect(detail.getByRole("link", { name: "journal.svg" })).toBeVisible();
  await expect(detail.getByRole("link", { name: "unsafe.html" })).toBeVisible();
  const requestsBeforeRetry = detailRequests;
  returnNewUrl = true;
  const retry = visual.getByRole("button", {
    name: "Обновить ссылки и повторить",
  });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    visual.getByRole("img", { name: "Отчёт: report.svg" })
  ).toBeVisible();
  await expect(visual.getByRole("alert")).toHaveCount(0);
  expect(detailRequests).toBeGreaterThan(requestsBeforeRetry);
  expect(oldImageRequests).toBeGreaterThanOrEqual(1);
  expect(newImageRequests).toBeGreaterThanOrEqual(1);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});
