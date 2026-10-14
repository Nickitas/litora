import assert from "node:assert/strict";
import { test } from "node:test";
import { includeJsonMetric } from "./output-metrics.js";

test("закрытый ключ AI-01 остаётся артефактом, но не попадает в сводные метрики", () => {
  assert.equal(includeJsonMetric("seabed/expert-set/organizer-key.json", 1000), false);
  assert.equal(includeJsonMetric("seabed\\expert-set\\organizer-key.json", 1000), false);
  assert.equal(includeJsonMetric("seabed/expert-set/expert-set-report.json", 1000), true);
  assert.equal(includeJsonMetric("seabed/adaptive/comparison/adaptive-generator-comparison.json", 1000), true);
  assert.equal(includeJsonMetric("seabed/adaptive/comparison/large.json", 128_001), false);
  assert.equal(includeJsonMetric("erosion/visualization/index.json", 1000), false);
  assert.equal(includeJsonMetric("erosion/visualization/chunks/000001.json", 1000), false);
});
