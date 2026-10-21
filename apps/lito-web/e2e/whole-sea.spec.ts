import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type {
  AuthDto,
  ScientificCatalogueEntryDto,
  ScientificInputDto,
  CoastlineValidationDto,
  CalculationJobDto,
  ReusableScientificArtifactDto,
} from "@litora/contracts";

const session: AuthDto = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "sea@example.test",
    name: "Исследователь",
  },
  accessToken: "test-session-only",
  expiresIn: 900,
};
const sourceId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const lineId = "44444444-4444-4444-8444-444444444444";
const entry: ScientificCatalogueEntryDto = {
  id: "black-sea-marineregions",
  name: "Чёрное море · граница MarineRegions",
  role: "coastline_geojson",
  filename: "black-sea-marineregions.geojson",
  sizeBytes: 299701,
  source:
    "Flanders Marine Institute (VLIZ), MarineRegions: IHO Sea Area, Black Sea, MRGID 3319",
  sourceRevision: "WFS timeStamp 2026-08-19T19:01:44.672Z; архив article_1",
  license: "CC-BY",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  sha256: "116dcbc076ff0086e8bb3d72a34fc1df5353dc3c93c5cad91a99c336e039d246",
  sourceUrl: "https://www.marineregions.org/gazetteer.php?p=details&id=3319",
  licenseUrl: "https://www.marineregions.org/disclaimer.php",
  geometryKind: "sea_area_boundary",
  purpose:
    "Обзор всего Чёрного моря и выделение фрагментов границы морского района",
  limitations: [
    "Граница IHO Sea Area включает служебные границы акватории; это не береговая съёмка.",
    "Независимая точность положения берега и дата его наблюдения не подтверждены.",
  ],
};
const approved: CoastlineValidationDto = {
  jobId,
  status: "succeeded",
  accepted: true,
  issues: [],
  truncated: false,
  message: null,
  methodId: "coastline-validation",
  methodRevision: "geometry-1",
  updatedAt: "2026-10-21T00:00:00.000Z",
};
const own: ScientificInputDto = {
  ...entry,
  id: sourceId,
  name: "Мой полный исходник",
  status: "ready",
  createdAt: "2026-10-21T00:00:00.000Z",
  validation: approved,
};
const line: ReusableScientificArtifactDto = {
  id: lineId,
  jobId,
  jobKind: "coastline_region",
  role: "coastline_geojson",
  filename: "region/segments/segment-001.geojson",
  sizeBytes: 80,
  sha256: "b".repeat(64),
  createdAt: own.createdAt,
};
const regionJob: CalculationJobDto = {
  id: jobId,
  kind: "coastline_region",
  status: "succeeded",
  input: {
    west: 29,
    east: 31.5,
    south: 44.5,
    north: 46.5,
    coastlineInputId: sourceId,
  },
  inputSchemaVersion: 1,
  resultSummary: null,
  resultSchemaVersion: 1,
  coreVersion: "test-only",
  methodId: "coastline-region",
  methodRevision: "clip-1",
  commandLine: null,
  errorMessage: null,
  createdAt: own.createdAt,
  updatedAt: own.createdAt,
  startedAt: own.createdAt,
  finishedAt: own.createdAt,
  artifacts: [
    {
      id: lineId,
      category: "output",
      filename: line.filename,
      contentType: "application/geo+json",
      sizeBytes: line.sizeBytes,
      sha256: line.sha256,
      downloadUrl: "https://private.example.test/line",
    },
  ],
};
const geojson: Record<string, unknown> = JSON.parse(readFileSync(new URL("../../lito-cli/data/coastline/black-sea.geojson", import.meta.url), "utf8"));
type Mode =
  | "normal"
  | "quota"
  | "list-error"
  | "lost-response"
  | "preview-error"
  | "validation-unavailable"
  | "scenario-disabled";
async function setup(page: Page, mode: Mode = "normal") {
  let saved = false,
    selected = false,
    previewAllowed = mode !== "preview-error";
  const posts: { path: string; body: unknown }[] = [],
    unexpected: string[] = [],
    pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname,
        method = route.request().method();
      const send = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (method === "POST")
        posts.push({ path, body: route.request().postDataJSON() });
      if (path === "/api/auth/refresh") return send(session);
      if (path === "/api/datasets") return send([]);
      if (path === "/api/scientific-inputs/catalogue") return send([entry]);
      const check =
        mode === "validation-unavailable"
          ? {
              ...approved,
              status: "not_requested",
              accepted: null,
              message:
                "Проверка научных контуров сейчас отключена. Обратитесь к оператору.",
            }
          : approved;
      if (path === "/api/scientific-inputs")
        return mode === "list-error"
          ? send({ message: "Список научных файлов недоступен" }, 403)
          : send(saved ? [{ ...own, validation: check }] : []);
      if (path === "/api/scientific-inputs/quota")
        return send({
          usedCount: mode === "quota" ? 20 : saved ? 1 : 0,
          limitCount: 20,
          usedBytes: saved ? entry.sizeBytes : 0,
          limitBytes: 2 * 1024 ** 3,
        });
      if (path === "/api/scientific-inputs/reusable-artifacts")
        return send(selected ? [line] : []);
      if (path === "/api/calculations/kinds")
        return send(
          mode === "scenario-disabled"
            ? [
                {
                  kind: "dimension_file",
                  title: "Размерность файла",
                  description: "Тест",
                },
              ]
            : [
                {
                  kind: "coastline_region",
                  title: "Выбрать участок побережья",
                  description: "Тест",
                },
                {
                  kind: "dimension_file",
                  title: "Размерность файла",
                  description: "Тест",
                },
              ]
        );
      if (
        path === `/api/scientific-inputs/catalogue/${entry.id}` &&
        method === "POST"
      ) {
        saved = true;
        if (mode === "lost-response")
          return send({ message: "Ответ потерян после сохранения" }, 503);
        return send({ ...own, validation: check }, 201);
      }
      if (path === `/api/scientific-inputs/${sourceId}/validation`)
        return send(check);
      if (
        path === "/api/calculations/coastline-preview" ||
        path === `/api/scientific-inputs/${sourceId}/coastline-preview`
      ) {
        if (!previewAllowed)
          return send({ message: "Обзор временно недоступен" }, 503);
        return send({
          source: entry.source,
          sourceRevision: entry.sourceRevision,
          license: entry.license,
          sha256: entry.sha256,
          crs: entry.crs,
          geojson,
        });
      }
      if (path === "/api/calculations" && method === "POST") {
        selected = true;
        return send({ ...regionJob, status: "queued", artifacts: [] }, 201);
      }
      if (path === `/api/calculations/${jobId}`) return send(regionJob);
      if (path === "/api/calculations/page")
        return send({ items: [], nextCursor: null, totalCount: 0 });
      if (path === "/api/calculations") return send([]);
      if (path === "/api/calculations/deletions-current") return send(null);
      unexpected.push(`${method} ${path}`);
      return route.abort();
    }
  );
  return {
    posts,
    unexpected,
    pageErrors,
    allowPreview: () => {
      previewAllowed = true;
    },
  };
}
const wholeSea = (page: Page) =>
  page.getByRole("region", { name: "Всё Чёрное море", exact: true });

test("всё море: обзор, приватный исходник, область и повторное использование сохранённой линии", async ({
  page,
}) => {
  const observed = await setup(page);
  await page.goto("/lab/datasets");
  const section = wholeSea(page);
  await expect(section.getByRole("img")).toBeVisible();
  await expect(section.getByText(/это не береговая съёмка/)).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Оригинал MarineRegions" })
  ).toHaveAttribute("href", entry.sourceUrl);
  expect(
    observed.posts.filter((item) => item.path !== "/api/auth/refresh")
  ).toEqual([]);
  const name = section.getByLabel("Название полного исходника");
  await name.fill("Мой полный исходник");
  await name.evaluate((element) => {
    const form = element.closest("form")!;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(
    section.getByRole("link", { name: "Выделить участок" })
  ).toBeVisible();
  expect(
    observed.posts.filter((item) => item.path.includes("/catalogue/"))
  ).toEqual([
    {
      path: `/api/scientific-inputs/catalogue/${entry.id}`,
      body: { name: own.name },
    },
  ]);
  await section.getByRole("link", { name: "Выделить участок" }).click();
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(
    dialog.getByRole("combobox", { name: "Что рассчитать" })
  ).toContainText("Выбрать участок побережья");
  await expect(
    dialog.getByRole("combobox", {
      name: "GeoJSON береговой линии или полного контура",
    })
  ).toContainText(own.name);
  for (const [label, value] of [
    ["Западная долгота, °", "29"],
    ["Восточная долгота, °", "31.5"],
    ["Южная широта, °", "44.5"],
    ["Северная широта, °", "46.5"],
  ])
    await dialog.getByLabel(label).fill(value);
  await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/calculations/${jobId}$`));
  expect(
    observed.posts.find((item) => item.path === "/api/calculations")?.body
  ).toEqual({ kind: "coastline_region", input: regionJob.input });
  await page.getByRole("link", { name: "Открыть сохранённые участки" }).click();
  const saved = page.locator("#saved-region-lines");
  await expect(saved.getByText(line.filename, { exact: true })).toBeVisible();
  await saved.getByRole("link", { name: "Размерность этой линии" }).click();
  await expect(
    dialog.getByRole("combobox", {
      name: "GeoJSON береговой линии или полного контура",
    })
  ).toContainText(line.filename);
  expect(
    observed.posts.filter((item) => item.path === "/api/calculations")
  ).toHaveLength(1);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const mode of ["quota", "list-error"] as const)
  test(`всё море: обзор сохраняется, копирование блокируется — ${mode}`, async ({
    page,
  }) => {
    const observed = await setup(page, mode);
    await page.goto("/lab/datasets");
    const section = wholeSea(page);
    await expect(section.getByRole("img")).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Сохранить полный исходник" })
    ).toBeDisabled();
    await expect(
      section.getByText(
        mode === "quota"
          ? /Достигнут лимит научных файлов/
          : /Для сохранения обновите список/
      )
    ).toBeVisible();
    expect(
      observed.posts.filter((item) => item.path.includes("/catalogue/"))
    ).toEqual([]);
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });

test("всё море: потерянный ответ не создаёт повторную копию", async ({
  page,
}) => {
  const observed = await setup(page, "lost-response");
  await page.goto("/lab/datasets");
  await wholeSea(page)
    .getByRole("button", { name: "Сохранить полный исходник" })
    .click();
  await expect(
    wholeSea(page).getByRole("link", { name: "Выделить участок" })
  ).toBeVisible();
  await page.reload();
  await expect(
    wholeSea(page).getByText(`Приватный исходник «${own.name}» сохранён.`)
  ).toBeVisible();
  expect(
    observed.posts.filter((item) => item.path.includes("/catalogue/"))
  ).toHaveLength(1);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("всё море: ошибка обзора и повтор", async ({ page }) => {
  const observed = await setup(page, "preview-error");
  await page.goto("/lab/datasets");
  await expect(wholeSea(page).getByRole("alert")).toContainText(
    "Обзор временно недоступен"
  );
  observed.allowPreview();
  await wholeSea(page)
    .getByRole("button", { name: "Повторить обзор моря" })
    .click();
  await expect(wholeSea(page).getByRole("img")).toBeVisible();
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

test("всё море: недоступная проверка не разрешает запуск без допуска Go", async ({
  page,
}) => {
  const observed = await setup(page, "validation-unavailable");
  await page.goto("/lab/datasets");
  await wholeSea(page)
    .getByRole("button", { name: "Сохранить полный исходник" })
    .click();
  await expect(
    wholeSea(page).getByText(/Проверка научных контуров сейчас отключена/)
  ).toBeVisible();
  await expect(
    wholeSea(page).getByRole("link", { name: "Выделить участок" })
  ).toHaveCount(0);
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});

for (const source of [sourceId, "неверный-id", ""])
  test(`всё море: отсутствующий исходник не заменяется встроенным — ${source || "пустой"}`, async ({
    page,
  }) => {
    const observed = await setup(page);
    await page.goto(
      `/lab/calculations?new=1&scenario=coastline_region&coastline=${encodeURIComponent(source)}`
    );
    const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
    await expect(
      dialog.getByText(/Карта появится после явного выбора/)
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: /Карта для выбора/ })
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Запустить расчёт" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Исходный контур недоступен"
    );
    expect(
      observed.posts.filter((item) => item.path === "/api/calculations")
    ).toEqual([]);
    expect(observed.unexpected).toEqual([]);
    expect(observed.pageErrors).toEqual([]);
  });

test("всё море: явный выбор своего файла восстанавливает карту без встроенной подмены", async ({ page }) => {
  const observed = await setup(page);
  await page.goto("/lab/datasets");
  await wholeSea(page).getByRole("button", { name: "Сохранить полный исходник" }).click();
  await expect(wholeSea(page).getByRole("link", { name: "Выделить участок" })).toBeVisible();
  await page.goto("/lab/calculations?new=1&scenario=coastline_region&coastline=недоступный");
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.getByText(/Карта появится после явного выбора/)).toBeVisible();
  await dialog.getByRole("combobox", { name: "GeoJSON береговой линии или полного контура" }).click();
  await page.getByRole("option", { name: new RegExp(own.name) }).click();
  await expect(dialog.getByRole("img", { name: /Карта для выбора/ })).toBeVisible();
  expect(observed.posts.filter((item) => item.path === "/api/calculations")).toEqual([]);
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

test("всё море: отключённый сценарий не запускает другой расчёт", async ({ page }) => {
  const observed = await setup(page, "scenario-disabled");
  await page.goto("/lab/datasets");
  await wholeSea(page).getByRole("button", { name: "Сохранить полный исходник" }).click();
  await wholeSea(page).getByRole("link", { name: "Выделить участок" }).click();
  const dialog = page.getByRole("dialog", { name: "Новый расчёт" });
  await expect(dialog.getByRole("alert")).toContainText("Выделение области сейчас отключено на сервере");
  await expect(dialog.getByRole("button", { name: "Запустить расчёт" })).toBeDisabled();
  expect(observed.posts.filter((item) => item.path === "/api/calculations")).toEqual([]);
  expect(observed.unexpected).toEqual([]); expect(observed.pageErrors).toEqual([]);
});

test("всё море: адаптивный обзор, клавиатура и обе темы", async ({
  page,
}, testInfo) => {
  const observed = await setup(page);
  await page.goto("/lab/datasets");
  for (const width of [1440, 360])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      const toggle = page.locator("button[data-theme]");
      for (let attempt = 0; attempt < 3 && (await toggle.getAttribute("data-theme")) !== theme; attempt++) await toggle.click();
      await expect(toggle).toHaveAttribute("data-theme", theme);
      await expect(wholeSea(page).getByRole("img")).toBeVisible();
      await wholeSea(page).getByLabel("Название полного исходника").focus();
      await page.keyboard.press("Tab");
      await expect(
        wholeSea(page).getByRole("button", {
          name: "Сохранить полный исходник",
        })
      ).toBeFocused();
      await page.getByRole("link", { name: "Всё Чёрное море", exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`whole-sea-${width}-${theme}.png`),
      });
    }
  expect(observed.unexpected).toEqual([]);
  expect(observed.pageErrors).toEqual([]);
});
