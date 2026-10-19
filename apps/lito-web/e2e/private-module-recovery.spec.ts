import { expect, test } from "@playwright/test";

test("после исчезновения модуля лаборатории обновление страницы сохраняет сессию", async ({
  page,
  context,
}) => {
  let refreshCookie = "refresh-0";
  let accessToken = "";
  let refreshCount = 0;
  let moduleRequests = 0;
  let documentRequests = 0;
  await context.addCookies([{
    name: "litora_refresh",
    value: refreshCookie,
    url: "http://127.0.0.1:5189/api/auth",
    httpOnly: true,
    sameSite: "Strict",
  }]);
  await context.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/refresh") {
      const cookie = route.request().headers().cookie ?? "";
      if (!cookie.includes(`litora_refresh=${refreshCookie}`)) {
        await route.fulfill({ status: 401, json: { message: "Сессия истекла" } });
        return;
      }
      refreshCount += 1;
      refreshCookie = `refresh-${refreshCount}`;
      accessToken = `access-${refreshCount}`;
      await route.fulfill({
        status: 200,
        headers: {
          "Set-Cookie": `litora_refresh=${refreshCookie}; HttpOnly; SameSite=Strict; Path=/api/auth`,
          "Cache-Control": "no-store",
        },
        json: {
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "researcher@example.test",
            name: "Исследователь",
          },
          accessToken,
          expiresIn: 900,
        },
      });
      return;
    }
    if (route.request().headers().authorization !== `Bearer ${accessToken}`) {
      await route.fulfill({ status: 401, json: { message: "Сессия истекла" } });
      return;
    }
    if (path === "/api/calculations/page") {
      await route.fulfill({ status: 200, json: { items: [], nextCursor: null, totalCount: 0 } });
      return;
    }
    if (path === "/api/calculations/deletions-current") {
      await route.fulfill({ status: 200, json: null });
      return;
    }
    if (path === "/api/calculations" || path === "/api/calculations/kinds") {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    await route.fulfill({ status: 404, json: { message: "Неизвестный тестовый запрос" } });
  });
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document")
      documentRequests += 1;
  });
  await page.route(
    (url) => url.pathname === "/src/pages/account/calculations.page.tsx",
    async (route) => {
      moduleRequests += 1;
      if (moduleRequests === 1) {
        await route.fulfill({ status: 404, contentType: "text/html", body: "Модуль недоступен" });
      } else {
        await route.continue();
      }
    },
  );

  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Обзор исследований" })).toBeVisible();
  await page.getByRole("link", { name: "Вся история" }).click();

  await expect(page).toHaveURL(/\/lab\/calculations$/);
  await expect(page.getByRole("heading", { name: "Расчёты" })).toBeVisible();
  await expect(page.getByText("Сессия завершена. Войдите снова.")).toHaveCount(0);
  expect(moduleRequests).toBe(2);
  expect(documentRequests).toBe(2);
  expect(refreshCount).toBe(2);
});
