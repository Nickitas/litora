import assert from "node:assert/strict";
import { test } from "node:test";
import { resultMethodFromManifest } from "./result-method.js";

const manifest = (command: string, id: string, revision = "baseline-1") =>
  Buffer.from(JSON.stringify({
    schemaVersion: 2,
    command,
    method: { id, revision },
    artifacts: [{ path: "report.json", sizeBytes: 2, sha256: "a".repeat(64) }],
  }));

test("worker читает ревизию только из соответствующего Go-манифеста", () => {
  assert.deepEqual(
    resultMethodFromManifest(manifest("lito dimension", "box-counting"), "dimension_dataset"),
    { id: "box-counting", revision: "baseline-1" },
  );
  assert.deepEqual(
    resultMethodFromManifest(manifest("lito map", "black-sea-overview"), "map"),
    { id: "black-sea-overview", revision: "baseline-1" },
  );
  assert.deepEqual(
    resultMethodFromManifest(manifest("lito erosion", "cerc-one-line"), "erosion"),
    { id: "cerc-one-line", revision: "baseline-1" },
  );
  for (const bytes of [
    Buffer.from("not json"),
    Buffer.from(JSON.stringify({ schemaVersion: 2, command: "lito erosion" })),
    Buffer.from(JSON.stringify({ schemaVersion: 1, command: "lito erosion", method: { id: "cerc-one-line", revision: "baseline-1" } })),
    manifest("lito map", "cerc-one-line"),
    manifest("lito erosion", "cerc-one-line", ""),
    manifest("lito erosion", "cerc-one-line", "../../bad"),
  ])
    assert.throws(() => resultMethodFromManifest(bytes, "erosion"));
});
