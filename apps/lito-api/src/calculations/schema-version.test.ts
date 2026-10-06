import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSupportedInputSchemaVersion } from "../schema-versions.js";

test("worker принимает опубликованные версии схемы входа", () => {
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(1));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(2));
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(3));
  for (const version of [null, 0, 4, -1])
    assert.throws(() => assertSupportedInputSchemaVersion(version));
});
