import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type {
  AuthDto,
  CalculationJobDto,
  CalculationKindDto,
  CalculationMetadataExportV1,
  DatasetDto,
} from "@litora/contracts";
import { erosionDemoDefaults } from "@litora/contracts";
import { defaultCoastlineDataset } from "@litora/generated-data";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "browser@example.test",
  name: "Тестовый исследователь",
};
const session = {
  user,
  accessToken: "browser-test-token",
  expiresIn: 900,
} satisfies AuthDto;
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

type ApiReply = { status?: number; body: unknown };

async function mockApi(
  page: Page,
  reply: (
    path: string,
    method: string,
    body: unknown,
    params: URLSearchParams
  ) => ApiReply | undefined
) {
  const unexpected: string[] = [];
  const pageErrors: string[] = [];
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
      let result = reply(path, method, body, url.searchParams);
      if (!result && path === "/api/calculations/page" && method === "GET") {
        const legacy = reply(
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
      if (!result && method === "GET" &&
          (path === "/api/scientific-inputs" || path === "/api/scientific-inputs/reusable-artifacts"))
        result = { body: [] };
      if (!result) {
        unexpected.push(`${method} ${path}`);
        await route.abort("blockedbyclient");
        return;
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

async function openNewCalculation(page: Page) {
  await page.goto("/account");
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
    if ((await button.getAttribute("data-theme")) === mode) return;
    await button.click();
  }
  await expect(button).toHaveAttribute("data-theme", mode);
}

test("устаревшая ссылка на создание возвращает к обзору", async ({ page }) => {
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST")
      return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: kinds };
    if (path === "/api/calculations" && method === "GET") return { body: [] };
  });

  await page.goto("/account/calculations/new");
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("расчёт из истории открывает редактируемые параметры без автоматического запуска", async ({ page }) => {
  const original = { ...job, status: "succeeded" as const };
  const created = {
    ...job,
    id: "44444444-4444-4444-8444-444444444444",
    input: { steps: 5 },
  };
  let submitted: unknown;
  const observed = await mockApi(page, (path, method, body) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET") return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET") return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET") return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });

  await page.goto(`/account/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog).toBeVisible();
  const steps = dialog.getByLabel("Шаги волнового ряда (1–48)");
  await expect(steps).toHaveValue("4");
  expect(submitted).toBeUndefined();
  await steps.fill("5");
  await dialog.getByLabel("Коэффициент CERC").fill("0.5");
  await dialog.getByLabel("Сохранить CSV метрик").check();
  await chooseOption(page, "Формат CSV", "Wide — столбцы по состояниям");
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/account/calculations/${created.id}$`));
  expect(submitted).toEqual({ kind: "erosion", input: {
    ...erosionDemoDefaults, steps: 5, cercCoefficient: 0.5,
    outputCsv: true, csvFormat: "wide",
  } });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("отсутствующий исходный набор не заменяется примером без согласия", async ({ page }) => {
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
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET") return { body: kinds };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/datasets" && method === "POST") {
      datasetCreated = true;
      return { status: 201, body: dataset };
    }
    if (path === "/api/calculations" && method === "GET") return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET") return { body: original };
    if (path === `/api/calculations/${created.id}` && method === "GET") return { body: created };
    if (path === "/api/calculations" && method === "POST") {
      submitted = body;
      return { status: 201, body: created };
    }
  });

  await page.goto(`/account/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog.getByText("Исходный набор больше недоступен.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Исходный набор данных недоступен");
  expect(datasetCreated).toBe(false);
  expect(submitted).toBeUndefined();
  await dialog.getByRole("button", { name: "Использовать встроенный пример вместо исходного" }).click();
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/account/calculations/${created.id}$`));
  expect(datasetCreated).toBe(true);
  expect(submitted).toEqual({ kind: "dimension_dataset", input: { datasetId: dataset.id } });
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("недоступный научный файл требует нового выбора и закрытие возвращает фокус", async ({ page }) => {
  const original = {
    ...job,
    kind: "dimension_file",
    input: { coastlineInputId: "77777777-7777-4777-8777-777777777777" },
  };
  let submitted = false;
  const observed = await mockApi(page, (path, method) => {
    if (path === "/api/auth/refresh" && method === "POST") return { body: session };
    if (path === "/api/calculations/kinds" && method === "GET")
      return { body: [...kinds, { kind: "dimension_file", title: "Полный контур", description: "Тест" }] };
    if (path === "/api/datasets" && method === "GET") return { body: [] };
    if (path === "/api/calculations" && method === "GET") return { body: [original] };
    if (path === `/api/calculations/${original.id}` && method === "GET") return { body: original };
    if (path === "/api/calculations" && method === "POST") {
      submitted = true;
      return { status: 201, body: original };
    }
  });

  await page.goto(`/account/calculations/${original.id}`);
  await page.getByRole("link", { name: "Создать на основе" }).click();
  const dialog = page.getByRole("dialog", { name: "Расчёт на основе" });
  await expect(dialog.getByText("Часть исходных данных больше недоступна.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Выберите все научные входные файлы");
  expect(submitted).toBe(false);
  await dialog.getByRole("button", { name: "Закрыть окно нового расчёта" }).click();
  await expect(page).toHaveURL(/\/account\/calculations$/);
  await expect(page.getByRole("link", { name: "Расчёты" })).toBeFocused();
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

  await page.goto("/account");
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

  await page.getByRole("link", { name: "Расчёты", exact: true }).click();
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

  await page.goto("/account");
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

test("перед запуском объясняются входы, ограничения и справка каждого сценария", async ({
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
      source: "Поставляемая обзорная линия Чёрного моря",
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
      source: "Поставляемая обзорная схема Чёрного моря",
      limitation: "Карта нужна для ориентира",
      reference: "black-sea-map.md",
    },
    {
      kind: "erosion",
      source: "Закреплённые волновые и батиметрические данные",
      limitation: "Демонстрация CERC, а не прогноз годового размыва",
      reference: "cerc-one-line-model.md",
    },
  ]) {
    await chooseOption(
      page,
      "Что рассчитать",
      kinds.find((kind) => kind.kind === item.kind)?.title ?? item.kind
    );
    await expect(dialog.getByText(item.source, { exact: false })).toBeVisible();
    await expect(
      dialog.getByText(item.limitation, { exact: false })
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /откроется в новой вкладке/ })
    ).toHaveAttribute("href", `/docs/reference/${item.reference}`);
  }
  await expect(dialog.getByText("Демонстрационный сценарий")).toBeVisible();
  await expect(dialog.locator("footer").getByText("Демо")).toBeVisible();
  await expect(dialog.getByText("до 5 незавершённых расчётов")).toBeVisible();
  const referencePage = page.waitForEvent("popup");
  await dialog
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
  await expect(dialog).toBeVisible();
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
  await expect(page).toHaveURL(new RegExp(`/account/calculations/${job.id}$`));
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
  await expect(
    dialog.getByRole("button", { name: "Запустить расчёт" })
  ).toBeDisabled();
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
      if (params.get("cursor") === "older-page")
        return { body: { items: [older], nextCursor: null, totalCount: 3 } };
      return {
        body: { items: [newest, job], nextCursor: "older-page", totalCount: 3 },
      };
    }
  });

  await page.goto("/account/calculations");
  await expect(page.getByText("Найдено расчётов: 3")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "История расчётов" }).locator("li")
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Следующая страница" }).click();
  await expect(page).toHaveURL(/cursor=older-page/);
  await expect(
    page.getByRole("region", { name: "История расчётов" }).locator("li")
  ).toHaveCount(1);
  await chooseOption(page, "Статус", "Завершён");
  await expect(page).toHaveURL(/status=succeeded/);
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(page.getByText("Найдено расчётов: 2")).toBeVisible();
  await chooseOption(page, "На странице", "10");
  await expect(page).toHaveURL(/limit=10/);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(
    "/account/calculations?from=2026-10-01&to=2026-10-31&cursor=older-page"
  );
  await chooseTheme(page, "dark");
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
  await expect(page).toHaveURL(/\/account\/calculations$/);
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
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByText("Личный кабинет · Тестовый исследователь")
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
  await expect(page).toHaveURL(/\/account$/);
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
  await chooseOption(page, "Что рассчитать", "Размыв");
  await page.getByLabel("Шаги волнового ряда (1–48)").fill("4");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Вычислитель временно недоступен"
  );
  await expect(page.getByRole("alert")).toContainText("Параметры сохранены");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/account/calculations/${job.id}$`));
  await expect(
    page.getByRole("region", { name: "Результат расчёта" })
  ).toContainText(job.id);
  expect(requests).toEqual([
    { kind: "erosion", input: { ...erosionDemoDefaults, steps: 4 } },
    { kind: "erosion", input: { ...erosionDemoDefaults, steps: 4 } },
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
    { kind: "dimension_dataset", input: { datasetId: dataset.id } },
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
  await expect(page).toHaveURL(new RegExp(`/account/calculations/${job.id}$`));

  expect(uploads).toEqual([defaultCoastlineDataset]);
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: example.id } },
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
  await expect(page).toHaveURL(new RegExp(`/account/calculations/${job.id}$`));
  await expect(
    page.getByRole("region", { name: "Результат расчёта" })
  ).toContainText(job.id);
  expect(uploads).toEqual([defaultCoastlineDataset]);
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: example.id } },
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

  await page.goto("/account/calculations");
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

  await page.goto("/account/calculations");
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

  const compareControls = page.getByLabel("Сравнить", { exact: true });
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
    input: { ...erosionDemoDefaults, steps: 4, cercCoefficient: 0.5, outputCsv: true, csvFormat: "wide" as const, accessToken: "input-secret" },
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
  await page.goto(`/account/calculations/${first.id}`);
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
    window.history.pushState({}, "", `/account/calculations/${id}`);
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
    input: { ...erosionDemoDefaults, steps: 4, cercCoefficient: 0.5, outputCsv: true, csvFormat: "wide" },
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
    window.history.pushState({}, "", `/account/calculations/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, first.id);
  await oldRequest;
  await page.evaluate((id) => {
    window.history.pushState({}, "", `/account/calculations/${id}`);
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
  await page.goto(`/account/calculations/${legacy.id}`);
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

  await page.goto(`/account/calculations/${initial.id}`, {
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
