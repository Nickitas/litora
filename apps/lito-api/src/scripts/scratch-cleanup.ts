import { environment } from "../config/environment.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { cleanupHeavyScratch, type ScratchDatabase, type ScratchJob } from "../worker/scratch-cleanup.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(`Проверка scratch heavy worker. По умолчанию удаление отключено.
Параметры:
  --apply                Удалить проверенные старые каталоги
  --confirm-root=PATH    Точное подтверждение LITO_JOBS_DIRECTORY для --apply
  --max-remove=N         Лимит 1–50 каталогов, по умолчанию 20
  --help                 Эта справка`);
    return;
  }
  if (environment.workerProfile !== "heavy") {
    console.error("Команда доступна только при LITO_WORKER_PROFILE=heavy");
    process.exitCode = 2;
    return;
  }
  let apply = false;
  let confirmRoot: string | undefined;
  let maxRemove: number | undefined;
  for (const arg of args) {
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--confirm-root=")) confirmRoot = arg.slice(15);
    else if (arg.startsWith("--max-remove=")) maxRemove = Number(arg.slice(13));
    else {
      console.error("Неизвестный параметр. Используйте --help");
      process.exitCode = 2;
      return;
    }
  }
  const service = new DatabaseService();
  const db: ScratchDatabase = {
    async getJob(id) {
      const result = await service.query<ScratchJob>(
        `SELECT id,status,resource_profile,worker_id,finished_at
         FROM calculation_jobs WHERE id=$1`, [id]);
      return result.rows[0];
    },
    async hasActiveHeavy() {
      const result = await service.query<{ active: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM calculation_jobs
         WHERE resource_profile='heavy' AND status IN ('queued','running')) AS active`);
      return result.rows[0]?.active !== false;
    },
  };
  try {
    const report = await cleanupHeavyScratch(environment.jobsDirectory, db,
      { apply, confirmRoot, maxRemove });
    console.log(`Scratch heavy: просмотрено ${report.scanned}, кандидатов ${report.eligible}, ` +
      `удалено ${report.removed}, пропущено ${report.skipped}` +
      (report.limited ? "; достигнут лимит удаления" : ""));
  } catch {
    console.error("Очистка не завершена: проверьте каталог, состояние heavy очереди и подключение к БД. Данные вне подтверждённых каталогов не удалялись.");
    process.exitCode = 2;
  } finally {
    await service.onModuleDestroy();
  }
}

void main();
