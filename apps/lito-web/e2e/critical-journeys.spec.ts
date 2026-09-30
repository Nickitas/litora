import { expect, test, type Page } from "@playwright/test";
import type {
  AuthDto,
  CalculationJobDto,
  CalculationKindDto,
} from "@litora/contracts";

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
  resultSummary: null,
  coreVersion: null,
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
  { kind: "erosion", title: "Размыв", description: "Тестовый сценарий" },
] satisfies CalculationKindDto[];

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
