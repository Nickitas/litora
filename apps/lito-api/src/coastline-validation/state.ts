import type {
  CoastlineValidationDto,
  CoastlineValidationIssueDto,
  CalculationStatus,
} from "@litora/contracts";
import type { DatabaseService } from "../infrastructure/database.service.js";

export type CoastlineSourceType = "dataset" | "scientific";

interface ValidationRow {
  id: string;
  source_id: string;
  status: CalculationStatus;
  result_summary: unknown;
  method_id: string | null;
  method_revision: string | null;
  updated_at: Date;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function unrequestedValidation(
  message: string | null = null,
): CoastlineValidationDto {
  return {
    jobId: null,
    status: "not_requested",
    accepted: null,
    issues: [],
    truncated: false,
    message,
    methodId: null,
    methodRevision: null,
    updatedAt: null,
  };
}

export function validationState(
  row: ValidationRow,
  sha256: string,
): CoastlineValidationDto {
  const metrics =
    record(row.result_summary) && record(row.result_summary.metrics)
      ? row.result_summary.metrics
      : {};
  const report = metrics["coastline-validation.json"];
  const valid =
    record(report) &&
    report.schemaVersion === "litora-coastline-validation/v1" &&
    report.sourceSha256 === sha256 &&
    typeof report.accepted === "boolean" &&
    Array.isArray(report.issues);
  const issues: CoastlineValidationIssueDto[] = [];
  if (valid) {
    for (const issue of report.issues as unknown[]) {
      if (
        !record(issue) ||
        (issue.severity !== "error" && issue.severity !== "warning") ||
        typeof issue.code !== "string" ||
        typeof issue.message !== "string" ||
        issue.message.length > 1000
      )
        continue;
      const item: CoastlineValidationIssueDto = {
        severity: issue.severity,
        code: issue.code.slice(0, 100),
        message: issue.message,
      };
      for (const field of ["path", "point", "segment", "otherSegment"] as const)
        if (
          typeof issue[field] === "number" &&
          Number.isSafeInteger(issue[field]) &&
          issue[field] > 0
        )
          item[field] = issue[field];
      issues.push(item);
      if (issues.length === 200) break;
    }
  }
  return {
    jobId: row.id,
    status: row.status,
    accepted: valid ? (report.accepted as boolean) : null,
    issues,
    truncated: valid && report.truncated === true,
    message:
      row.status === "failed" && !valid
        ? "Проверка не завершилась. Откройте журнал задания или запустите её повторно."
        : row.status === "succeeded" && !valid
          ? "У задания нет подходящего отчёта геометрии. Выполните новую проверку."
          : null,
    methodId: row.method_id,
    methodRevision: row.method_revision,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function validationStates(
  db: DatabaseService,
  userId: string,
  type: CoastlineSourceType,
  sources: readonly { id: string; sha256: string | null }[],
): Promise<Map<string, CoastlineValidationDto>> {
  if (!sources.length) return new Map();
  const expression =
    type === "dataset" ? "dataset_id::text" : "input->>'coastlineInputId'";
  const kind =
    type === "dataset" ? "dataset_validation" : "coastline_validation";
  const result = await db.query<ValidationRow>(
    `SELECT DISTINCT ON (${expression}) id, ${expression} AS source_id, status,result_summary,method_id,method_revision,updated_at
     FROM calculation_jobs WHERE user_id=$1 AND kind=$2 AND ${expression}=ANY($3::text[])
     AND deletion_requested_at IS NULL ORDER BY ${expression},created_at DESC,id DESC`,
    [userId, kind, sources.map((source) => source.id)],
  );
  const hashes = new Map(sources.map((source) => [source.id, source.sha256]));
  return new Map(
    result.rows.map((row) => [
      row.source_id,
      validationState(row, hashes.get(row.source_id) ?? ""),
    ]),
  );
}
