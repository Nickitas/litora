import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { test } from "node:test";
import { assertResultArtifacts } from "./result-artifacts.js";

test("worker отвергает неполный, изменённый и незаявленный комплект до публикации", async () => {
  const output = await mkdtemp(join(tmpdir(), "litora-result-artifacts-"));
  const names = ["metrics/dimension.metrics.json", "svg/dimension_0.svg", "svg/dimension_loglog_0.svg"];
  const artifacts = names.map((path) => ({ path, sizeBytes: 2, sha256: createHash("sha256").update("{}").digest("hex") }));
  const manifest = join(output, "manifest.json");
  const paths = [...names, "manifest.json", "execution.log"].map((path) => join(output, path));
  const save = () => writeFile(manifest, JSON.stringify({ artifacts }));
  try {
    for (const path of paths) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "{}");
    }
    await save();
    const verified = await assertResultArtifacts(output, "dimension", paths);
    assert.equal(verified.get(names[0]), artifacts[0].sha256);
    const last = artifacts.pop()!;
    await save();
    await assert.rejects(assertResultArtifacts(output, "dimension", paths), /не заявленные/);
    await assert.rejects(assertResultArtifacts(output, "dimension", paths.filter((p) => !p.endsWith(last.path))), /обязательный отчёт/);
    artifacts.push(last);
    await save();
    await writeFile(join(output, last.path), "[]");
    await assert.rejects(assertResultArtifacts(output, "dimension", paths), /Контрольная сумма/);
    await writeFile(join(output, last.path), "");
    await assert.rejects(assertResultArtifacts(output, "dimension", paths), /Размер отчёта/);
    last.sizeBytes = 0;
    last.sha256 = createHash("sha256").update("").digest("hex");
    await save();
    await assert.rejects(assertResultArtifacts(output, "dimension", paths), /пустой обязательный отчёт/);
    last.path = "../outside.svg";
    await save();
    await assert.rejects(assertResultArtifacts(output, "dimension", paths), /Некорректный/);
    last.path = artifacts[0].path;
    await save();
    await assert.rejects(assertResultArtifacts(output, "dimension", paths), /Некорректный/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
