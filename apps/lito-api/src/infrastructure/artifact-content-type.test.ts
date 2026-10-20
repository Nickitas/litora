import assert from "node:assert/strict";
import { test } from "node:test";
import { artifactContentType } from "./artifact-content-type.js";

test("HTTP текстовых артефактов явно указывает UTF-8", () => {
  for (const type of ["text/plain", "text/csv", "application/json", "application/geo+json", "image/svg+xml"])
    assert.equal(artifactContentType(type), `${type}; charset=utf-8`);
  for (const type of ["image/png", "application/octet-stream", "application/zip", "text/plain; charset=utf-8"])
    assert.equal(artifactContentType(type), type);
});
