import { test } from "node:test";
import assert from "node:assert/strict";
import { readAdaptiveVisualReports } from "@litora/contracts";

test("открытый индекс SVG проверяет схему, SHA, пути, типы и дубли", () => {
  const entry = { report_type: "expert_fragment_cards", filename: "seabed/expert-set/cards/E-009.svg", sha256: "a".repeat(64), title: "Карточка E-009", description: "Окно текущего набора" };
  const index = { schema_version: "lito-adaptive-visual-reports/v1", comparison_report_sha256: "b".repeat(64), reports: [entry] };
  assert.deepEqual(readAdaptiveVisualReports(index), index);
  assert.equal(readAdaptiveVisualReports({ ...index, privateKey: "secret" })?.reports.length, 1);
  assert.ok(!JSON.stringify(readAdaptiveVisualReports({ ...index, privateKey: "secret" })).includes("secret"));
  for (const invalid of [null, [], {}, { ...index, schema_version: "v2" }, { ...index, comparison_report_sha256: "bad" }, { ...index, reports: [entry, entry] },
    ...[
      { filename: entry.filename + "\n" }, { sha256: entry.sha256 + "\n" },
      { filename: "../cards/E-009.svg" }, { filename: "/seabed/expert-set/cards/E-009.svg" },
      { filename: "https://example.test/E-009.svg" }, { filename: "seabed/expert-set/organizer-key.json" },
      { filename: "seabed/expert-set/cards/../E-009.svg" }, { report_type: "unknown" },
      { sha256: "invalid" }, { title: "" }, { description: null },
    ].map((change) => ({ ...index, reports: [{ ...entry, ...change }] })),
  ]) assert.equal(readAdaptiveVisualReports(invalid), null);
  for (const [report_type, filename] of [
    ["adaptive_mesh_overviews", "seabed/adaptive/comparison/coarse/delaunay/mesh-preview.svg"],
    ["adaptive_mesh_windows", "seabed/adaptive/comparison/local/frontal-quad/mesh-window-kizilirmak-publication.svg"],
  ]) assert.ok(readAdaptiveVisualReports({ ...index, reports: [{ ...entry, report_type, filename }] }));
});
