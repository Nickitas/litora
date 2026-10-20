import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionLog } from "./execution-log.js";

test("журнал сохраняет кириллицу и emoji при каждом положении разрыва UTF-8", () => {
  const expected = "✓ Береговая линия Чёрного моря 🧾\n";
  const bytes = Buffer.from(expected);
  for (let split = 0; split <= bytes.length; split++) {
    const log = new ExecutionLog();
    log.append("stdout", bytes.subarray(0, split));
    log.append("stdout", bytes.subarray(split));
    assert.equal(log.finish(), expected);
  }
});

test("декодеры stdout и stderr не смешивают части многобайтовых символов", () => {
  const log = new ExecutionLog();
  const out = Buffer.from("Берег"), error = Buffer.from("Ошибка");
  log.append("stdout", out.subarray(0, 1));
  log.append("stderr", error.subarray(0, 1));
  log.append("stdout", out.subarray(1));
  log.append("stderr", error.subarray(1));
  assert.equal(log.finish(), "БерегОшибка");
});

test("ограничение длины не оставляет половину surrogate pair и сохраняет префикс", () => {
  const log = new ExecutionLog(4);
  log.append("stdout", Buffer.from("abc🧾хвост"));
  log.append("stderr", Buffer.from("ещё"));
  assert.equal(log.finish(), "abc");
  assert.equal(new TextDecoder("utf8", { fatal: true }).decode(Buffer.from(log.text)), "abc");
});
