import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseService } from "../infrastructure/database.service.js";
import { validationState, validationStates } from "./state.js";

const sha = "a".repeat(64);
const report = {
  schemaVersion: "litora-coastline-validation/v1",
  sourceSha256: sha,
  accepted: false,
  truncated: false,
  issues: [
    {
      severity: "error",
      code: "self_intersection",
      message: "Пересекаются сегменты 1 и 3",
      path: 1,
      segment: 1,
      otherSegment: 3,
    },
  ],
};
const row = {
  id: "job",
  source_id: "source",
  status: "failed" as const,
  method_id: "coastline-validation",
  method_revision: "geometry-1",
  updated_at: new Date(),
  result_summary: { metrics: { "coastline-validation.json": report } },
};

test("отчёт привязан к checksum, старый отчёт и ошибка инфраструктуры не означают принятие", () => {
  const result = validationState(row, sha);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.issues, report.issues);
  assert.equal(result.methodRevision, "geometry-1");
  for (const candidate of [
    { ...row, result_summary: null },
    {
      ...row,
      result_summary: {
        metrics: {
          "coastline-validation.json": {
            ...report,
            sourceSha256: "b".repeat(64),
          },
        },
      },
    },
    {
      ...row,
      status: "succeeded" as const,
      result_summary: { source: "legacy" },
    },
  ]) {
    const state = validationState(candidate, sha);
    assert.equal(state.accepted, null);
    assert.deepEqual(state.issues, []);
    assert.ok(state.message);
  }
});

test("внешние замечания ограничены и не принимают произвольные значения индексов", () => {
  const unsafe = {
    severity: "error",
    code: "test",
    message: "Замечание",
    path: -1,
    point: 1.5,
    segment: Infinity,
  };
  const state = validationState(
    {
      ...row,
      result_summary: {
        metrics: {
          "coastline-validation.json": {
            ...report,
            truncated: true,
            issues: [
              null,
              { ...unsafe, severity: "fatal" },
              { ...unsafe, message: "x".repeat(1001) },
              ...Array(210).fill(unsafe),
            ],
          },
        },
      },
    },
    sha,
  );
  assert.equal(state.issues.length, 200);
  assert.deepEqual(state.issues[0], {
    severity: "error",
    code: "test",
    message: "Замечание",
  });
  assert.equal(state.truncated, true);
});

test("состояния читаются одним запросом по владельцу, роли и неизменяемому источнику", async () => {
  for (const type of ["dataset", "scientific"] as const) {
    const db = {
      async query(sql: string, values: unknown[]) {
        assert.match(sql, /user_id=\$1 AND kind=\$2/);
        assert.match(sql, /deletion_requested_at IS NULL/);
        assert.match(sql, /created_at DESC,id DESC/);
        assert.deepEqual(values, [
          "owner",
          type === "dataset" ? "dataset_validation" : "coastline_validation",
          ["source"],
        ]);
        return { rows: [row] };
      },
    } as unknown as DatabaseService;
    assert.equal(
      (
        await validationStates(db, "owner", type, [
          { id: "source", sha256: sha },
        ])
      ).get("source")?.accepted,
      false,
    );
    assert.equal((await validationStates(db, "owner", type, [])).size, 0);
  }
});
