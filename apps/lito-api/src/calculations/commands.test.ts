import { test } from "node:test";
import assert from "node:assert/strict";
import { commandArguments, validateCalculation } from "./commands.js";

test("пользователь не может передать shell, пути или URL в CLI", () => {
  for (const input of [
    { kind: "bash" },
    { kind: "dimension", input: { input: "/etc/passwd" } },
    { kind: "map", input: { "source-url": "http://internal" } },
    { kind: "erosion", input: { steps: "3;echo hacked" } },
    { kind: "erosion", input: { steps: 10000 } },
    { kind: "dimension", args: [] },
  ]) {
    assert.throws(() => validateCalculation(input));
  }
});
test("допустимый запрос преобразуется в фиксированные аргументы", () => {
  assert.deepEqual(commandArguments({ kind: "erosion" }, "/tmp/job"), [
    "erosion",
    "--black-sea-sochi",
    "--offline",
    "--steps",
    "3",
    "--output",
    "/tmp/job",
  ]);
  assert.deepEqual(validateCalculation({ kind: "map" }), {
    kind: "map",
    input: {},
  });
});

test("пользовательский расчёт принимает только UUID, а путь создаёт worker", () => {
  const datasetId = "33333333-3333-4333-8333-333333333333";
  const job = validateCalculation({
    kind: "dimension_dataset",
    input: { datasetId },
  });
  assert.deepEqual(job, { kind: "dimension_dataset", input: { datasetId } });
  assert.throws(() => commandArguments(job, "/tmp/output"));
  assert.deepEqual(
    commandArguments(job, "/tmp/output", "/tmp/server/input.geojson"),
    [
      "dimension",
      "--input",
      "/tmp/server/input.geojson",
      "--output",
      "/tmp/output",
    ],
  );
  for (const input of [
    {},
    { datasetId: "/etc/passwd" },
    { datasetId: "http://internal" },
    { datasetId, path: "x" },
  ])
    assert.throws(() =>
      validateCalculation({ kind: "dimension_dataset", input }),
    );
});
