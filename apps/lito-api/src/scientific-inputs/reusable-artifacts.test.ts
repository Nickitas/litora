import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseService } from "../infrastructure/database.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";
import { reusableArtifactRole } from "./reusable-artifacts.js";

test("только известные результаты Go становятся входами подходящей роли", () => {
  assert.equal(reusableArtifactRole("mesh", "mesh/msh/black-sea-edge-1000-detail-1000-frontal-quad.msh"), "flat_mesh_msh");
  assert.equal(reusableArtifactRole("seabed_build", "seabed/black-sea-depth.msh"), "seabed_msh");
  assert.equal(reusableArtifactRole("seabed_build", "seabed/export-metadata.json"), "export_metadata_json");
  assert.equal(reusableArtifactRole("seabed_adapt", "seabed/adaptive/size-field.csv"), "adaptive_field_csv");
  assert.equal(reusableArtifactRole("seabed_adapt", "seabed/adaptive/size-field.json"), "adaptive_field_report_json");
  assert.equal(reusableArtifactRole("source_file", "black-sea-20261006-030000.geojson"), "coastline_geojson");
  assert.equal(reusableArtifactRole("source_file", "black-sea-20261006-030000.json"), "coastline_geojson");
  for (const [kind, path] of [
    ["mesh", "mesh/msh/../../secret.msh"],
    ["seabed_build", "seabed/build-report.json"],
    ["seabed_compare_adaptive", "seabed/adaptive/comparison/level/gmsh/black-sea-adaptive.msh"],
    ["source_file", "manifest.json"],
  ]) assert.equal(reusableArtifactRole(kind, path), null);
});

test("повторное использование проверяет владельца, успех, bucket, роль и размер", async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  let artifact = {
    id: "artifact", job_id: "job", job_kind: "seabed_build",
    filename: "seabed/black-sea-depth.msh", size_bytes: "220000000",
    sha256: "a".repeat(64), object_key: "users/job/seabed/black-sea-depth.msh",
    created_at: new Date(),
  };
  const database = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: sql.includes("FROM calculation_artifacts") ? [artifact] : [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  const resolved = await repository.resolveOwnedSource("artifact", "owner", "seabed_msh", "private-bucket");
  assert.equal(resolved.origin, "artifact");
  assert.equal(resolved.source_job_id, "job");
  assert.equal(queries[1].params[1], "owner");
  assert.equal(queries[1].params[2], "private-bucket");
  assert.match(queries[1].sql, /j\.user_id=\$2 AND j\.status='succeeded'/);
  assert.match(queries[1].sql, /a\.category='output' AND a\.bucket=\$3/);
  await assert.rejects(repository.resolveOwnedSource("artifact", "owner", "flat_mesh_msh", "private-bucket"));
  artifact = { ...artifact, size_bytes: String(3 * 1024 * 1024 * 1024) };
  await assert.rejects(repository.resolveOwnedSource("artifact", "owner", "seabed_msh", "private-bucket"));
});

test("список для ЛК фильтрует неизвестные выходы и не выдаёт S3-ключ", async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const base = {
    id: "artifact", job_id: "job", job_kind: "seabed_adapt",
    filename: "seabed/adaptive/size-field.csv", size_bytes: "123",
    sha256: "b".repeat(64), object_key: "users/job/field.csv",
    created_at: new Date("2026-10-06T00:00:00.000Z"),
  };
  const database = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [base, { ...base, id: "log", filename: "execution.log" }] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  const result = await repository.listReusableArtifacts("owner", "private-bucket");
  assert.equal(result.length, 1);
  assert.equal(result[0].role, "adaptive_field_csv");
  assert.equal("objectKey" in result[0], false);
  assert.equal(queries[0].params[0], "owner");
  assert.equal(queries[0].params[1], "private-bucket");
  assert.match(queries[0].sql, /j\.user_id=\$1 AND j\.status='succeeded'/);
});
