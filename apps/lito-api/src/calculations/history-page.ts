import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type {
  CalculationKind,
  CalculationPageQueryDto,
  CalculationStatus,
} from "@litora/contracts";

const statuses = new Set<CalculationStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const kinds = new Set<CalculationKind>([
  "dimension",
  "dimension_dataset",
  "map",
  "erosion",
]);
const queryKeys = new Set([
  "status",
  "kind",
  "from",
  "to",
  "jobId",
  "limit",
  "cursor",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export interface HistoryPageOptions extends CalculationPageQueryDto {
  limit: number;
  toExclusive?: string;
  after?: { createdAt: string; id: string };
  fingerprint: string;
}

function validDay(value: string): boolean {
  if (!dayPattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function fingerprint(
  userId: string,
  filters: Pick<
    CalculationPageQueryDto,
    "status" | "kind" | "from" | "to" | "jobId"
  >,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        userId,
        filters.status,
        filters.kind,
        filters.from,
        filters.to,
        filters.jobId,
      ]),
    )
    .digest("hex")
    .slice(0, 24);
}

export function parseHistoryPageQuery(
  raw: unknown,
  userId: string,
): HistoryPageOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new BadRequestException("Некорректные параметры истории");
  const query = raw as Record<string, unknown>;
  if (
    Object.keys(query).some(
      (key) =>
        !queryKeys.has(key) ||
        typeof query[key] !== "string" ||
        query[key] === "",
    )
  )
    throw new BadRequestException(
      "Неизвестный или повторяющийся параметр истории",
    );
  const status = query.status as string | undefined;
  const kind = query.kind as string | undefined;
  const from = query.from as string | undefined;
  const to = query.to as string | undefined;
  const jobId = query.jobId as string | undefined;
  const rawLimit = query.limit as string | undefined;
  const cursor = query.cursor as string | undefined;
  if (status && !statuses.has(status as CalculationStatus))
    throw new BadRequestException("Неизвестный статус расчёта");
  if (kind && !kinds.has(kind as CalculationKind))
    throw new BadRequestException("Неизвестный сценарий расчёта");
  if (
    (from && !validDay(from)) ||
    (to && !validDay(to)) ||
    (from && to && from > to)
  )
    throw new BadRequestException("Некорректный период истории");
  if (jobId && !uuidPattern.test(jobId))
    throw new BadRequestException("Для поиска укажите UUID расчёта");
  if (rawLimit !== undefined && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit))
    throw new BadRequestException("Размер страницы: целое от 1 до 50");
  const filters = {
    status: status as CalculationStatus | undefined,
    kind: kind as CalculationKind | undefined,
    from,
    to,
    jobId: jobId?.toLowerCase(),
  };
  const mark = fingerprint(userId, filters);
  let after: HistoryPageOptions["after"];
  if (cursor !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor))
      throw new BadRequestException("Некорректный курсор истории");
    try {
      const decoded = Buffer.from(cursor, "base64url");
      if (decoded.toString("base64url") !== cursor)
        throw new Error("non-canonical cursor");
      const data: unknown = JSON.parse(decoded.toString("utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("invalid cursor");
      const value = data as Record<string, unknown>;
      if (
        Object.keys(value).length !== 4 ||
        value.v !== 1 ||
        value.f !== mark ||
        typeof value.t !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.t) ||
        Number.isNaN(Date.parse(value.t)) ||
        new Date(value.t).toISOString().slice(0, 23) !== value.t.slice(0, 23) ||
        typeof value.id !== "string" ||
        !uuidPattern.test(value.id)
      )
        throw new Error("invalid cursor");
      after = { createdAt: value.t, id: value.id };
    } catch {
      throw new BadRequestException("Некорректный курсор истории");
    }
  }
  return {
    ...filters,
    limit: rawLimit === undefined ? 20 : Number(rawLimit),
    toExclusive: to
      ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString()
      : undefined,
    after,
    fingerprint: mark,
  };
}

export function encodeHistoryCursor(
  createdAt: string,
  id: string,
  mark: string,
): string {
  return Buffer.from(
    JSON.stringify({ v: 1, t: createdAt, id, f: mark }),
  ).toString("base64url");
}
