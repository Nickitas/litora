import { expect, test } from "@playwright/test";

const aboutModule = (url: URL) =>
  url.pathname === "/src/pages/about/about.page.tsx" ||
  /^\/assets\/about\.page-[^/]+\.js$/.test(url.pathname);

test("сбой лениво загружаемого раздела восстанавливается без экрана ошибки", async ({
  page,
}) => {
  let moduleRequests = 0;
  let documentRequests = 0;

  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      request.resourceType() === "document"
    ) {
      documentRequests += 1;
    }
  });

  await page.route(aboutModule, async (route) => {
    moduleRequests += 1;
    if (moduleRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "Временный сбой",
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.locator('a[href="/about"]').first().click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", { name: "О проекте Litora" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Не удалось открыть страницу" })
  ).toHaveCount(0);
  expect(moduleRequests).toBe(2);
  expect(documentRequests).toBe(2);
});

test("повторный сбой модуля не запускает бесконечную перезагрузку", async ({
  page,
}) => {
  let documentRequests = 0;
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      request.resourceType() === "document"
    ) {
      documentRequests += 1;
    }
  });

  await page.route(aboutModule, (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "Устойчивый сбой",
    })
  );

  await page.goto("/");
  await page.locator('a[href="/about"]').first().click();

  await expect(
    page.getByRole("heading", { name: "Не удалось открыть страницу" })
  ).toBeVisible();
  await expect(
    page.getByText("Не удалось загрузить часть приложения.", { exact: false })
  ).toBeVisible();
  expect(documentRequests).toBe(2);
});
