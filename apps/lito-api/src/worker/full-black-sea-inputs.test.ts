import { test } from "node:test";
import assert from "node:assert/strict";
import { assertFullBlackSeaStagingLimit } from "./full-black-sea-inputs.js";

test("QA-03 отклоняет слишком большие входы до загрузки S3", () => {
  assert.doesNotThrow(() => assertFullBlackSeaStagingLimit("seabed_check_full", "flatMeshInputId", "flat_mesh_msh", 256 * 1024 * 1024));
  assert.throws(() => assertFullBlackSeaStagingLimit("seabed_check_full", "flatMeshInputId", "flat_mesh_msh", 256 * 1024 * 1024 + 1), /256 МиБ/);
  assert.doesNotThrow(() => assertFullBlackSeaStagingLimit("seabed_check_full", "meshReportInputId", "mesh_comparison_report_json", 2 * 1024 * 1024));
  assert.throws(() => assertFullBlackSeaStagingLimit("seabed_check_full", "meshReportInputId", "mesh_comparison_report_json", 2 * 1024 * 1024 + 1), /2 МиБ/);
});
