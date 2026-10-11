import assert from "node:assert/strict";
import { test } from "node:test";
import { auditableCommandLine, redactExecutionLog } from "./command-line.js";

test("аудит команды не сохраняет источник волн", () => {
  const line = auditableCommandLine(["erosion", "--wave-source", "https://example.test/?token=secret", "--steps", "3"]);
  assert.match(line, /^lito erosion --wave-source \[источник скрыт\] --steps 3$/);
  assert.doesNotMatch(line, /secret/);
});

test("журнал CLI не сохраняет заявленный приватный источник", () => {
  const source = "https://example.test/?token=secret";
  assert.equal(redactExecutionLog(`Волновой ряд: ${source} (3 состояния)`, [source]),
    "Волновой ряд: [источник скрыт] (3 состояния)");
});
