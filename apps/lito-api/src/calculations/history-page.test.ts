import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeHistoryCursor, parseHistoryPageQuery } from "./history-page.js";

const userId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";

test("история принимает фильтры и cursor только для того же владельца и условий", () => {
  const query = {
    status: "succeeded",
    kind: "map",
    from: "2026-09-01",
    to: "2026-09-30",
    jobId,
    limit: "2",
  };
  const first = parseHistoryPageQuery(query, userId);
  assert.equal(first.limit, 2);
  assert.equal(first.toExclusive, "2026-10-01T00:00:00.000Z");
  const cursor = encodeHistoryCursor(
    "2026-09-29T12:00:00.000123Z",
    jobId,
    first.fingerprint,
  );
  const next = parseHistoryPageQuery({ ...query, cursor }, userId);
  assert.deepEqual(next.after, {
    createdAt: "2026-09-29T12:00:00.000123Z",
    id: jobId,
  });
  assert.throws(() =>
    parseHistoryPageQuery({ ...query, status: "failed", cursor }, userId),
  );
  assert.throws(() =>
    parseHistoryPageQuery(
      { ...query, cursor },
      "33333333-3333-4333-8333-333333333333",
    ),
  );
});

test("история отвергает неизвестные, повторённые и некорректные параметры", () => {
  for (const query of [
    { status: "other" },
    { status: "" },
    { kind: "shell" },
    { from: "2026-02-30" },
    { from: "2026-10-01", to: "2026-09-01" },
    { jobId: "part-of-name" },
    { limit: "0" },
    { limit: "51" },
    { limit: "1.5" },
    { status: ["failed", "running"] },
    { offset: "100" },
    { cursor: "%%%" },
  ])
    assert.throws(() => parseHistoryPageQuery(query, userId));
});

test("пустая история получает размер страницы 20 без cursor", () => {
  const parsed = parseHistoryPageQuery({}, userId);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.after, undefined);
});
