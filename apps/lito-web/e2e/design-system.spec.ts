/// <reference lib="dom" />
import { expect, test } from "@playwright/test";

function contrast(a: string, b: string): number {
  function luminance(hex: string) {
    const values = hex.match(/[0-9a-f]{2}/gi);
    if (!values || values.length !== 3)
      throw new Error(`Неверный цвет: ${hex}`);
    const [red, green, blue] = values.map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

test("обе темы: контраст токенов, сохранение выбора и узкий экран", async ({
  page,
}) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  );
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/login");
  const theme = page.getByRole("combobox", { name: "Тема оформления" });
  await expect(theme).toHaveValue("system");
  await expect(page.locator("html")).toHaveClass(/dark/);

  for (const mode of ["light", "dark"] as const) {
    await theme.selectOption(mode);
    await expect(page.locator("html")).toHaveClass(new RegExp(mode));
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) => style.getPropertyValue(name).trim();
      return {
        background: token("--background"),
        foreground: token("--foreground"),
        card: token("--card"),
        primary: token("--primary"),
        primaryForeground: token("--primary-foreground"),
        mutedForeground: token("--muted-foreground"),
        input: token("--input"),
        warning: token("--warning"),
        warningBackground: token("--warning-background"),
        statuses: ["queued", "running", "succeeded", "failed"].map(
          (status) => ({
            foreground: token(`--status-${status}-foreground`),
            background: token(`--status-${status}-background`),
          })
        ),
      };
    });
    expect(
      contrast(colors.foreground, colors.background)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(colors.primaryForeground, colors.primary)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(colors.mutedForeground, colors.background)
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.input, colors.card)).toBeGreaterThanOrEqual(3);
    expect(
      contrast(colors.warning, colors.warningBackground)
    ).toBeGreaterThanOrEqual(4.5);
    for (const status of colors.statuses)
      expect(
        contrast(status.foreground, status.background)
      ).toBeGreaterThanOrEqual(4.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(360);
  }

  await page.reload();
  await expect(theme).toHaveValue("dark");
  await page.getByLabel("Почта").focus();
  await expect(page.getByLabel("Почта")).toBeFocused();
  const outline = await page
    .getByLabel("Почта")
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

test("кабинет на 360 px показывает все статусы без горизонтальной прокрутки", async ({
  page,
}) => {
  const statuses = ["queued", "running", "succeeded", "failed", "cancelled"];
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const body =
        path === "/api/auth/refresh"
          ? {
              user: {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Исследователь",
                email: "design@example.test",
              },
              accessToken: "design-test-token",
              expiresIn: 900,
            }
          : path === "/api/calculations/kinds"
            ? [
                {
                  kind: "dimension",
                  title: "Размерность",
                  description: "Проверка",
                },
              ]
            : path === "/api/datasets"
              ? []
              : path === "/api/calculations"
                ? statuses.map((status, index) => ({
                    id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
                    kind: "dimension",
                    status,
                    input: {},
                    resultSummary: null,
                    coreVersion: null,
                    commandLine: null,
                    errorMessage: null,
                    createdAt: "2026-09-29T12:00:00.000Z",
                    updatedAt: "2026-09-29T12:00:00.000Z",
                    startedAt: null,
                    finishedAt: null,
                    artifacts: [],
                  }))
                : null;
      return route.fulfill({
        status: body === null ? 404 : 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
  );
  await page.goto("/account");
  const history = page.getByRole("region", { name: "История расчётов" });
  for (const label of [
    "В очереди",
    "Выполняется",
    "Завершён",
    "Ошибка",
    "Отменён",
  ])
    await expect(history.getByText(label)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const spinner = history.getByText("Выполняется").locator("svg");
  await expect(spinner).toHaveCSS("animation-name", "none");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(360);

  await page.setViewportSize({ width: 1280, height: 800 });
  const accountTrigger = page.getByRole("button", {
    name: "Открыть меню пользователя",
  });
  await accountTrigger.click();
  const accountMenu = page.locator("#account-menu");
  await expect(accountMenu).toBeVisible();
  await accountMenu.getByRole("link", { name: "Личный кабинет" }).focus();
  await page.keyboard.press("Escape");
  await expect(accountTrigger).toBeFocused();
  await expect(accountTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(accountMenu).toBeHidden();
});

test("справочник и релизы открываются в обеих темах на узком экране", async ({
  page,
}) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  );
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/docs", "/releases"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const mode of ["light", "dark"] as const) {
      await page
        .getByRole("combobox", { name: "Тема оформления" })
        .selectOption(mode);
      await expect(page.locator("html")).toHaveClass(new RegExp(mode));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(360);
    }
  }
});

test("главная и страница проекта не анимируются при reduced motion", async ({
  page,
}) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        current: {
          temperature_2m: 20,
          apparent_temperature: 19,
          relative_humidity_2m: 65,
          wind_speed_10m: 8,
          weather_code: 0,
          uv_index: 2,
          surface_pressure: 1013,
        },
      }),
    })
  );
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/about"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(360);
  }
  const ring = page.locator("[class*='motion-safe:animate-[spin_24s']");
  await expect(ring).toHaveCSS("animation-name", "none");
});

test("публичные CTA — одиночные ссылки, доступны клавиатурой", async ({
  page,
}) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  );
  await page.route("https://api.open-meteo.com/**", (route) => route.abort());
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/", "/about", "/installation", "/releases", "/login"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.locator("a button, button a, a a, button button")
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(360);
  }

  await page.goto("/");
  const skip = page.getByRole("link", { name: "Перейти к содержимому" });
  await expect(skip).toBeAttached();
  expect(
    await page.evaluate(() =>
      document
        .querySelector("a, button, input, select, textarea")
        ?.textContent?.trim()
    )
  ).toBe("Перейти к содержимому");
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  const details = page.getByRole("link", { name: "Подробнее" });
  await details.focus();
  await expect(details).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/about$/);

  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const detailsAtZoom = page.getByRole("link", { name: "Подробнее" });
  await expect(detailsAtZoom).toBeVisible();
  const ctaIsInsideHero = await detailsAtZoom.evaluate((link) => {
    const hero = link?.closest("section");
    const rect = link?.getBoundingClientRect();
    const heroRect = hero?.getBoundingClientRect();
    return Boolean(rect && heroRect && rect.bottom <= heroRect.bottom);
  });
  expect(ctaIsInsideHero).toBe(true);
  await detailsAtZoom.scrollIntoViewIfNeeded();
  await expect(detailsAtZoom).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(720);
});

test("мобильное меню закрывается по Escape и возвращает фокус", async ({
  page,
}) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
  );
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  const trigger = page.getByRole("button", { name: "Открыть меню" });
  await trigger.click();
  const menu = page.locator("#mobile-navigation");
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Закрыть меню" })
  ).toHaveAttribute("aria-expanded", "true");
  await menu.getByRole("link", { name: "О проекте" }).focus();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "О проекте" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
