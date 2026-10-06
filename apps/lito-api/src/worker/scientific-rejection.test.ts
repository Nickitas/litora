import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isScientificRejection } from "./scientific-rejection.js";

test("научно непринятый результат сохраняет отчёт, прочая ошибка остаётся частичной", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-rejection-"));
  try {
    const path = join(directory, "seabed", "quality", "relief-quality.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ metrics_accepted: false, reasons: ["порог превышен"] }));
    assert.equal(await isScientificRejection("seabed_validate", directory), true);
    assert.equal(await isScientificRejection("seabed_render", directory), false);
    await writeFile(path, JSON.stringify({ metrics_accepted: true }));
    assert.equal(await isScientificRejection("seabed_validate", directory), false);
    await writeFile(path, "{bad json");
    assert.equal(await isScientificRejection("seabed_validate", directory), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
