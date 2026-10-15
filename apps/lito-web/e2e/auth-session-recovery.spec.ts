import {
  expect,
  test,
  type BrowserContext,
  type Route,
} from "@playwright/test";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "researcher@example.test",
  name: "Исследователь",
};

type MockOptions = {
  expireFirstAccess?: boolean;
  failFirstRefresh?: boolean;
};

async function mockSession(context: BrowserContext, options: MockOptions = {}) {
  const state = {
    refreshToken: "refresh-0",
    accessToken: "",
    refreshCount: 0,
    refreshValid: true,
    failFirstRefresh: options.failFirstRefresh ?? false,
  };
  await context.addCookies([
    {
      name: "litora_refresh",
      value: state.refreshToken,
      url: "http://127.0.0.1:5189/api/auth",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);

  await context.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/refresh") {
        state.refreshCount += 1;
        const cookie = route.request().headers().cookie ?? "";
        const receivedToken = /(?:^|;\s*)litora_refresh=([^;]+)/.exec(
          cookie
        )?.[1];
        // Две вкладки со старой cookie должны соревноваться за одну ротацию.
        await new Promise((resolve) => setTimeout(resolve, 40));
        if (state.failFirstRefresh) {
          state.failFirstRefresh = false;
          await route.fulfill({
            status: 503,
            json: { message: "Сервер временно недоступен" },
          });
          return;
        }
        if (!state.refreshValid || receivedToken !== state.refreshToken) {
          await route.fulfill({
            status: 401,
            json: { message: "Сессия истекла. Войдите снова" },
          });
          return;
        }
        state.refreshToken = `refresh-${state.refreshCount}`;
        state.accessToken =
          options.expireFirstAccess && state.refreshCount === 1
            ? "server-revoked-access"
            : `access-${state.refreshCount}`;
        await route.fulfill({
          status: 200,
          headers: {
            "Set-Cookie": `litora_refresh=${state.refreshToken}; HttpOnly; SameSite=Strict; Path=/api/auth`,
            "Cache-Control": "no-store",
          },
          json: {
            user,
            accessToken: `access-${state.refreshCount}`,
            expiresIn: 900,
          },
        });
        return;
      }

      if (path === "/api/auth/logout") {
        state.refreshValid = false;
        await route.fulfill({
          status: 200,
          headers: {
            "Set-Cookie":
              "litora_refresh=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0",
          },
          json: { ok: true },
        });
        return;
      }

      const protectedPath =
        path === "/api/calculations" ||
        path === "/api/calculations/kinds" ||
        path === "/api/calculations/page";
      if (protectedPath) {
        const bearer = route.request().headers().authorization;
        if (
          path === "/api/calculations/kinds" &&
          bearer === "Bearer access-1" &&
          options.expireFirstAccess
        )
          await new Promise((resolve) => setTimeout(resolve, 250));
        if (bearer !== `Bearer ${state.accessToken}`) {
          await route.fulfill({
            status: 401,
            json: { message: "Сессия истекла. Войдите снова" },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          json:
            path === "/api/calculations/page"
              ? { items: [], nextCursor: null, totalCount: 0 }
              : [],
        });
        return;
      }
      if (path === "/api/calculations/deletions-current") {
        await route.fulfill({ status: 200, json: null });
        return;
      }
      await route.fulfill({
        status: 404,
        json: { message: "Неизвестный тестовый запрос" },
      });
    }
  );

  return state;
}

test("поздний 401 старого access-token не вызывает повторный refresh и ложную ошибку", async ({
  page,
  context,
}) => {
  const state = await mockSession(context, { expireFirstAccess: true });
  await page.goto("/lab");
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => state.refreshCount).toBe(2);
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
        (value) => value.includes("access-2")
      )
    )
  ).toBe(false);
});

test("две вкладки сохраняют вход при одновременном обновлении cookie", async ({
  page,
  context,
}) => {
  const state = await mockSession(context);
  const secondPage = await context.newPage();
  await Promise.all([page.goto("/lab"), secondPage.goto("/lab")]);
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  await expect(page.getByText("Сессия завершена. Войдите снова.")).toHaveCount(
    0
  );
  await expect(
    secondPage.getByText("Сессия завершена. Войдите снова.")
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(secondPage.getByRole("alert")).toHaveCount(0);
  expect(state.refreshCount).toBeLessThanOrEqual(2);
});

test("временный сбой refresh предлагает повтор, а не завершает вход", async ({
  page,
  context,
}) => {
  await mockSession(context, { failFirstRefresh: true });
  await page.goto("/lab");
  await expect(
    page.getByRole("button", { name: "Повторить проверку" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/lab$/);
  await page.getByRole("button", { name: "Повторить проверку" }).click();
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
});

test("подтверждённый отзыв refresh-сессии ведёт на вход с пояснением", async ({
  page,
  context,
}) => {
  const state = await mockSession(context);
  await page.goto("/lab");
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  state.refreshValid = false;
  state.accessToken = "revoked";
  await page.getByRole("link", { name: "Вся история" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("alert")).toHaveText(
    "Сессия завершена. Войдите снова."
  );
});

test("выход завершает сессию в обеих вкладках без сообщения об истечении", async ({
  page,
  context,
}) => {
  await mockSession(context);
  const secondPage = await context.newPage();
  await Promise.all([page.goto("/lab"), secondPage.goto("/lab")]);
  await expect(
    page.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  await expect(
    secondPage.getByRole("heading", { name: "Обзор исследований" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Открыть меню пользователя" }).click();
  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(secondPage).toHaveURL(/\/login$/);
  await expect(page.getByText("Сессия завершена. Войдите снова.")).toHaveCount(
    0
  );
  await expect(
    secondPage.getByText("Сессия завершена. Войдите снова.")
  ).toHaveCount(0);
});
