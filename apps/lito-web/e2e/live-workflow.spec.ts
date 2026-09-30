import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.use({ trace: "off" });

test("реальный кабинет: регистрация, GeoJSON по умолчанию и отчёт @live", async ({
  page,
}) => {
  test.skip(
    !process.env.LITORA_E2E_LIVE_URL || !process.env.LITORA_E2E_INVITATION,
    "Нужны изолированный стенд и одноразовое тестовое приглашение",
  );
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500)
      serverErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" })
    .click();
  await page.getByLabel("Имя").fill("Проверка полного пути");
  await page.getByLabel("Почта").fill(`live-${randomUUID()}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill(`test-${randomUUID()}`);
  await page
    .getByLabel("Ключ приглашения")
    .fill(process.env.LITORA_E2E_INVITATION!);
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByLabel("Сценарий")).toBeEnabled();

  await page.getByLabel("Сценарий").selectOption("dimension_dataset");
  await expect(page.getByLabel("Ваш набор данных")).toHaveValue("");
  await page.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page.getByLabel("Ваш набор данных")).toHaveValue(
    /^[0-9a-f-]{36}$/,
  );
  const result = page.getByRole("region", { name: "Результат расчёта" });
  await expect(result.getByText("Завершён", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(result).toContainText("manifest.json");
  const manifestUrl = await result
    .getByRole("link", { name: "manifest.json" })
    .getAttribute("href");
  expect(manifestUrl).toBeTruthy();
  const download = await page.request.get(manifestUrl!);
  expect(download.status()).toBe(200);
  const manifest = await download.json();
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.artifacts.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Мои исследования" })).toBeVisible();
  await expect(page.getByRole("region", { name: "История расчётов" }))
    .toContainText("Размерность своей береговой линии");
  expect(serverErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
