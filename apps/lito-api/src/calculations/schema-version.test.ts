import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSupportedInputSchemaVersion } from "../schema-versions.js";

test("worker принимает опубликованные версии схемы входа", () => {
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(1));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(2));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(3));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(4));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(5));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(6));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(7));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(8));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(9));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(10));
  for (const version of [null, 0, 11, -1])
    assert.throws(() => assertSupportedInputSchemaVersion(version));
});
