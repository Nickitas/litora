import {
  formatQueueDiagnostics,
  parseQueueDiagnosticsArgs,
  readQueueDiagnostics,
} from "../worker/queue-diagnostics.js";

async function main(): Promise<void> {
  let options;
  try {
    options = parseQueueDiagnosticsArgs(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(
      error instanceof Error ? error.message : "Неверные параметры проверки."
    );
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(`Диагностика пользовательских очередей (только чтение).
Параметры:
  --profile all|standard|heavy   Профили проверки, по умолчанию all
  --queue-wait-seconds N         Порог ожидания: 1–604800 с, по умолчанию 300
  --stale-after-seconds N        Порог heartbeat: 60–86400 с, по умолчанию 60
  --require-worker              Требовать свежий worker каждого выбранного профиля
  --json                        Снимок JSON v2
  --help                        Эта справка
Код выхода: 0 — сигналов нет; 1 — требуется внимание; 2 — проверка не выполнена.
Свежий heartbeat worker не подтверждает успешность расчёта.`);
    return;
  }
  try {
    const { DatabaseService } =
      await import("../infrastructure/database.service.js");
    const db = new DatabaseService();
    try {
      const report = await readQueueDiagnostics(db, options);
      console.log(
        options.json ? JSON.stringify(report) : formatQueueDiagnostics(report)
      );
      process.exitCode = report.status === "attention" ? 1 : 0;
    } finally {
      await db.onModuleDestroy();
    }
  } catch {
    console.error(
      "Не удалось проверить очередь. Проверьте конфигурацию API, подключение к PostgreSQL и наличие миграций; снимок не получен."
    );
    process.exitCode = 2;
  }
}

void main();
