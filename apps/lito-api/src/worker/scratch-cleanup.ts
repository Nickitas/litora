import { lstat, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const markerName = ".litora-scratch.json";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(["succeeded", "failed", "cancelled"]);
const minimumAgeMs = 24 * 60 * 60 * 1000;
const maximumEntries = 5000;
const maximumRootEntries = 1000;

export interface ScratchJob {
  id: string;
  status: string;
  resource_profile: string;
  worker_id: string | null;
  finished_at: Date | null;
}

export interface ScratchDatabase {
  getJob(id: string): Promise<ScratchJob | undefined>;
  hasActiveHeavy(): Promise<boolean>;
}

export interface ScratchReport {
  scanned: number;
  eligible: number;
  removed: number;
  skipped: number;
  limited: boolean;
}

export async function markHeavyScratch(directory: string, jobId: string): Promise<void> {
  if (!uuidPattern.test(jobId)) throw new Error("Недопустимый ID задания");
  await writeFile(join(directory, markerName), JSON.stringify({
    schemaVersion: 1,
    jobId,
    resourceProfile: "heavy",
  }), { flag: "wx", mode: 0o600 });
}

async function inspectDirectory(directory: string, jobId: string, cutoff: number): Promise<boolean> {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink() || root.mtimeMs > cutoff) return false;
  let marker: unknown;
  try {
    const info = await lstat(join(directory, markerName));
    if (!info.isFile() || info.isSymbolicLink()) return false;
    marker = JSON.parse(await readFile(join(directory, markerName), "utf8"));
  } catch {
    return false;
  }
  if (!marker || typeof marker !== "object" ||
    (marker as Record<string, unknown>).schemaVersion !== 1 ||
    (marker as Record<string, unknown>).jobId !== jobId ||
    (marker as Record<string, unknown>).resourceProfile !== "heavy") return false;

  const pending = [directory];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    const entries = await readdir(current);
    for (const name of entries) {
      if (++count > maximumEntries) return false;
      const path = join(current, name);
      const entry = await lstat(path);
      if (entry.mtimeMs > cutoff || entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) pending.push(path);
      else if (!entry.isFile()) return false;
    }
  }
  return true;
}

function eligibleJob(job: ScratchJob | undefined, id: string, cutoff: number): boolean {
  return Boolean(job && job.id === id && job.resource_profile === "heavy" &&
    terminal.has(job.status) && job.worker_id === null && job.finished_at &&
    job.finished_at.getTime() <= cutoff);
}

export async function cleanupHeavyScratch(
  root: string,
  db: ScratchDatabase,
  options: { apply?: boolean; confirmRoot?: string; maxRemove?: number; now?: number } = {},
): Promise<ScratchReport> {
  const absoluteRoot = resolve(root);
  if (absoluteRoot === "/" || await realpath(absoluteRoot) !== absoluteRoot)
    throw new Error("Scratch root должен быть существующим каталогом без symlink");
  if (!(await lstat(absoluteRoot)).isDirectory())
    throw new Error("Scratch root не является каталогом");
  if (options.apply && (!options.confirmRoot || resolve(options.confirmRoot) !== absoluteRoot))
    throw new Error("Для удаления укажите точный --confirm-root");
  const maxRemove = options.maxRemove ?? 20;
  if (!Number.isInteger(maxRemove) || maxRemove < 1 || maxRemove > 50)
    throw new Error("maxRemove должен быть от 1 до 50");
  if (options.apply && await db.hasActiveHeavy())
    throw new Error("Heavy очередь не пуста; удаление запрещено");

  const names = await readdir(absoluteRoot);
  if (names.length > maximumRootEntries)
    throw new Error("Слишком много scratch-каталогов для безопасного прохода");
  const cutoff = (options.now ?? Date.now()) - minimumAgeMs;
  const report: ScratchReport = { scanned: names.length, eligible: 0, removed: 0, skipped: 0, limited: false };
  for (const id of names) {
    if (!uuidPattern.test(id)) { report.skipped++; continue; }
    const directory = join(absoluteRoot, id);
    if (!await inspectDirectory(directory, id, cutoff)) { report.skipped++; continue; }
    if (!eligibleJob(await db.getJob(id), id, cutoff)) { report.skipped++; continue; }
    report.eligible++;
    if (!options.apply) continue;
    if (report.removed >= maxRemove) { report.limited = true; continue; }
    // Повторная проверка перед каждой операцией; при ошибке БД команда прерывается.
    if (await db.hasActiveHeavy()) throw new Error("Heavy очередь стала активной; очистка остановлена");
    if (!eligibleJob(await db.getJob(id), id, cutoff) ||
      !await inspectDirectory(directory, id, cutoff)) {
      report.skipped++;
      report.eligible--;
      continue;
    }
    await rm(directory, { recursive: true });
    report.removed++;
  }
  return report;
}
