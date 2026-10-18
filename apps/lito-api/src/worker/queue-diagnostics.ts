import { parseArgs } from "node:util";

type ResourceProfile = "standard" | "heavy";

/** QueueDiagnosticsOptions задаёт область и пороги операторской проверки. */
export interface QueueDiagnosticsOptions {
  profiles: ResourceProfile[];
  queueWaitSeconds: number;
  staleAfterSeconds: number;
  json: boolean;
  help: boolean;
}

interface QueueSnapshotRow {
  profile: ResourceProfile;
  observed_at: Date;
  queued_count: string;
  running_count: string;
  stale_running_count: string;
  unassigned_running_count: string;
  oldest_queued_seconds: number | null;
  oldest_heartbeat_seconds: number | null;
}

interface DiagnosticsDatabase {
  query(sql: string, values: unknown[]): Promise<{ rows: QueueSnapshotRow[] }>;
}

/** QueueDiagnostics содержит агрегаты без UUID, входов и персональных данных. */
export interface QueueDiagnostics {
  schemaVersion: 1;
  observedAt: string;
  status: "no_alerts" | "attention";
  workerAvailability: "unknown";
  thresholds: { queueWaitSeconds: number; staleAfterSeconds: number };
  profiles: {
    profile: ResourceProfile;
    queuedCount: number;
    runningCount: number;
    staleRunningCount: number;
    unassignedRunningCount: number;
    oldestQueuedAgeSeconds: number | null;
    oldestHeartbeatAgeSeconds: number | null;
  }[];
  alerts: {
    profile: ResourceProfile;
    code: "stale_running" | "unassigned_running" | "queue_wait_exceeded";
    severity: "warning" | "critical";
    message: string;
  }[];
}

/** parseQueueDiagnosticsArgs проверяет параметры без подключения к сервисам. */
export function parseQueueDiagnosticsArgs(
  args: string[]
): QueueDiagnosticsOptions {
  const { values } = (() => {
    try {
      return parseArgs({
        args: args.filter((value) => value !== "--"),
        options: {
          profile: { type: "string", default: "all" },
          "queue-wait-seconds": { type: "string", default: "300" },
          "stale-after-seconds": { type: "string", default: "60" },
          json: { type: "boolean", default: false },
          help: { type: "boolean", default: false },
        },
      });
    } catch {
      throw new Error(
        "Неизвестные или неверные параметры. Используйте --help."
      );
    }
  })();
  const profile = values.profile;
  if (profile !== "all" && profile !== "standard" && profile !== "heavy")
    throw new Error("Профиль должен быть all, standard или heavy.");

  function seconds(
    value: string,
    name: string,
    min: number,
    max: number
  ): number {
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new Error(
        `${name}: укажите целое число от ${min} до ${max} секунд.`
      );
    return Number(value);
  }
  return {
    profiles: profile === "all" ? ["standard", "heavy"] : [profile],
    queueWaitSeconds: seconds(
      values["queue-wait-seconds"],
      "Порог ожидания",
      1,
      604800
    ),
    staleAfterSeconds: seconds(
      values["stale-after-seconds"],
      "Порог heartbeat",
      60,
      86400
    ),
    json: values.json,
    help: values.help,
  };
}

function count(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error("БД вернула некорректный счётчик очереди.");
  return Number(value);
}

function age(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0)
    throw new Error("БД вернула некорректный возраст задания.");
  return Math.ceil(value);
}

/** readQueueDiagnostics получает один снимок пользовательских очередей через SELECT. */
export async function readQueueDiagnostics(
  db: DiagnosticsDatabase,
  options: QueueDiagnosticsOptions
): Promise<QueueDiagnostics> {
  const result = await db.query(
    `WITH profiles(profile) AS (VALUES ('standard'), ('heavy')),
     active AS (
       SELECT resource_profile AS profile,
         count(*) FILTER (WHERE status='queued')::text AS queued_count,
         count(*) FILTER (WHERE status='running')::text AS running_count,
         count(*) FILTER (WHERE status='running' AND worker_id IS NOT NULL
           AND (heartbeat_at IS NULL OR heartbeat_at < now()-$1::integer*interval '1 second'))::text AS stale_running_count,
         count(*) FILTER (WHERE status='running' AND worker_id IS NULL)::text AS unassigned_running_count,
         EXTRACT(EPOCH FROM now()-min(created_at) FILTER (WHERE status='queued'))::double precision AS oldest_queued_seconds,
         EXTRACT(EPOCH FROM now()-min(heartbeat_at) FILTER (WHERE status='running' AND worker_id IS NOT NULL))::double precision AS oldest_heartbeat_seconds
       FROM calculation_jobs
       WHERE user_id IS NOT NULL AND status IN ('queued','running')
         AND resource_profile=ANY($2::text[])
       GROUP BY resource_profile
     )
     SELECT p.profile, now() AS observed_at,
       coalesce(a.queued_count,'0') AS queued_count,
       coalesce(a.running_count,'0') AS running_count,
       coalesce(a.stale_running_count,'0') AS stale_running_count,
       coalesce(a.unassigned_running_count,'0') AS unassigned_running_count,
       CASE WHEN a.oldest_queued_seconds IS NOT NULL THEN greatest(0,a.oldest_queued_seconds) END AS oldest_queued_seconds,
       CASE WHEN a.oldest_heartbeat_seconds IS NOT NULL THEN greatest(0,a.oldest_heartbeat_seconds) END AS oldest_heartbeat_seconds
     FROM profiles p LEFT JOIN active a USING(profile)
     WHERE p.profile=ANY($2::text[]) ORDER BY p.profile DESC`,
    [options.staleAfterSeconds, options.profiles]
  );
  if (
    result.rows.length !== options.profiles.length ||
    options.profiles.some(
      (profile) => !result.rows.some((row) => row.profile === profile)
    )
  )
    throw new Error("БД вернула неполный снимок очереди.");

  const report: QueueDiagnostics = {
    schemaVersion: 1,
    observedAt: result.rows[0].observed_at.toISOString(),
    status: "no_alerts",
    workerAvailability: "unknown",
    thresholds: {
      queueWaitSeconds: options.queueWaitSeconds,
      staleAfterSeconds: options.staleAfterSeconds,
    },
    profiles: result.rows.map((row) => ({
      profile: row.profile,
      queuedCount: count(row.queued_count),
      runningCount: count(row.running_count),
      staleRunningCount: count(row.stale_running_count),
      unassignedRunningCount: count(row.unassigned_running_count),
      oldestQueuedAgeSeconds: age(row.oldest_queued_seconds),
      oldestHeartbeatAgeSeconds: age(row.oldest_heartbeat_seconds),
    })),
    alerts: [],
  };
  for (const profile of report.profiles) {
    if (profile.staleRunningCount > 0)
      report.alerts.push({
        profile: profile.profile,
        code: "stale_running",
        severity: "critical",
        message: `${profile.profile}: у ${profile.staleRunningCount} выполняющихся заданий отсутствует или устарел heartbeat. Проверьте worker.`,
      });
    if (profile.unassignedRunningCount > 0)
      report.alerts.push({
        profile: profile.profile,
        code: "unassigned_running",
        severity: "critical",
        message: `${profile.profile}: у ${profile.unassignedRunningCount} выполняющихся заданий не назначен worker. Проверьте состояние очереди.`,
      });
    if (
      profile.queuedCount > 0 &&
      profile.oldestQueuedAgeSeconds !== null &&
      profile.oldestQueuedAgeSeconds > options.queueWaitSeconds
    )
      report.alerts.push({
        profile: profile.profile,
        code: "queue_wait_exceeded",
        severity: "warning",
        message: `${profile.profile}: ожидание ${profile.oldestQueuedAgeSeconds} с превышает порог ${options.queueWaitSeconds} с. Проверьте загрузку и доступность worker этого профиля.`,
      });
  }
  if (report.alerts.length) report.status = "attention";
  return report;
}

/** formatQueueDiagnostics выводит русский текст, не объявляя idle worker исправным. */
export function formatQueueDiagnostics(report: QueueDiagnostics): string {
  const lines = [
    `Снимок пользовательских очередей: ${report.observedAt}`,
    "Доступность worker не определена: проверяются только heartbeat выполняющихся заданий.",
  ];
  for (const profile of report.profiles) {
    lines.push(
      `${profile.profile}: в очереди ${profile.queuedCount}, выполняется ${profile.runningCount}; самое долгое ожидание ${profile.oldestQueuedAgeSeconds === null ? "—" : `${profile.oldestQueuedAgeSeconds} с`}; самый старый heartbeat ${profile.oldestHeartbeatAgeSeconds === null ? "—" : `${profile.oldestHeartbeatAgeSeconds} с`}.`
    );
  }
  lines.push(...report.alerts.map((alert) => alert.message));
  if (!report.alerts.length)
    lines.push("Превышений порогов и зависших заданий не обнаружено.");
  return lines.join("\n");
}
