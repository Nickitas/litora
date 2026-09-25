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
