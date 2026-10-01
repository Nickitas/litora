import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSupportedInputSchemaVersion } from "../schema-versions.js";

test("worker принимает только известную версию схемы входа", () => {
  assert.doesNotThrow(() => assertSupportedInputSchemaVersion(1));
  for (const version of [null, 0, 2, -1])
    assert.throws(() => assertSupportedInputSchemaVersion(version));
});
