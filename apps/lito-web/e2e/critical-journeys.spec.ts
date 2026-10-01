import { expect, test, type Page } from "@playwright/test";
import type {
  AuthDto,
  CalculationJobDto,
  CalculationKindDto,
  DatasetDto,
} from "@litora/contracts";
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
] satisfies CalculationKindDto[];
const dataset = {
  id: "33333333-3333-4333-8333-333333333333",
  schemaVersion: 1,
  name: "Тестовый контур",
  source: "Локальная съёмка",
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
  reply: (path: string, method: string, body: unknown) => ApiReply | undefined
) {
  const unexpected: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = undefined;
      }
      const result = reply(path, method, body);
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
    page.getByRole("heading", { name: "Мои исследования" })
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

  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Мои исследования" })
  ).toBeVisible();
  await page.getByLabel("Сценарий").selectOption("erosion");
  await page.getByLabel("Шаги волнового ряда (1–48)").fill("4");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Вычислитель временно недоступен"
  );
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(
    page.getByRole("region", { name: "Результат расчёта" })
  ).toContainText(job.id);
  await expect(
    page.getByRole("region", { name: "История расчётов" })
  ).toContainText("Размыв");
  expect(requests).toEqual([
    { kind: "erosion", input: { steps: 4 } },
    { kind: "erosion", input: { steps: 4 } },
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
    input: { datasetId: dataset.id },
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

  await page.goto("/account");
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
  await page.getByRole("button", { name: "Загрузить набор" }).click();
  await expect(page.getByLabel("Сценарий")).toHaveValue("dimension_dataset");
  await expect(page.getByLabel("Ваш набор данных")).toHaveValue(dataset.id);
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

test("без файла используется демонстрационный GeoJSON с собственным паспортом", async ({
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

  await page.goto("/account");
  await expect(
    page.getByText("По умолчанию: Пример: участок Сочи", { exact: false })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Использовать пример GeoJSON" })
    .click();
  await expect(page.getByLabel("Ваш набор данных")).toHaveValue(example.id);
  await page.getByRole("button", { name: "Запустить расчёт" }).click();

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

  await page.goto("/account");
  await page.getByLabel("Сценарий").selectOption("dimension_dataset");
  await expect(page.getByLabel("Ваш набор данных")).toHaveValue("");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page.getByLabel("Ваш набор данных")).toHaveValue(example.id);
  expect(uploads).toEqual([defaultCoastlineDataset]);
  expect(jobs).toEqual([
    { kind: "dimension_dataset", input: { datasetId: example.id } },
  ]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});
