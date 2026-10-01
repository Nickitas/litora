import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertOutputBudget,
  maxOutputBytes,
  maxOutputDirectories,
  maxOutputFiles,
} from "./output-budget.js";

test("выходной каталог в пределах бюджета допустим", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-output-budget-"));
  try {
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "nested", "report.json"), "{}");
    await assert.doesNotReject(assertOutputBudget(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("лимит временного размера проверяется до публикации результата", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-output-budget-"));
  try {
    const file = join(directory, "temporary.bin");
    await writeFile(file, "");
    await truncate(file, maxOutputBytes + 1);
    await assert.rejects(assertOutputBudget(directory), /лимит размера/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("слишком много файлов и ссылки в результатах отвергаются", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-output-budget-"));
  try {
    for (let index = 0; index <= maxOutputFiles; index++)
      await writeFile(join(directory, `report-${index}.json`), "{}");
    await assert.rejects(assertOutputBudget(directory), /лимит файлов/);
    for (let index = 0; index <= maxOutputFiles; index++)
      await rm(join(directory, `report-${index}.json`));
    await symlink("/etc/passwd", join(directory, "link"));
    await assert.rejects(assertOutputBudget(directory), /недопустимый тип/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("слишком много временных каталогов отвергается", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-output-budget-"));
  try {
    for (let index = 0; index <= maxOutputDirectories; index++)
      await mkdir(join(directory, `part-${index}`));
    await assert.rejects(assertOutputBudget(directory), /лимит каталогов/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
