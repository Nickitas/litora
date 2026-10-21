import { Link } from "react-router-dom";
import type {
  CalculationKindDto,
  CalculationStatus as Status,
} from "@litora/contracts";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { Button } from "@/shared/shadcn/components/ui/button";
import { DialogTrigger } from "@/shared/shadcn/components/ui/dialog";
import {
  useActiveCalculations,
  useCalculationKinds,
  useCalculations,
} from "./model/use-calculations";
import { CalculationTitle } from "./ui/calculation-title";

function JobLink({
  id,
  kind,
  status,
  createdAt,
  kinds,
}: {
  id: string;
  kind: string;
  status: Status;
  createdAt: string;
  kinds: CalculationKindDto[];
}) {
  return (
    <li>
      <Link
        to={`/lab/calculations/${id}`}
        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            <CalculationTitle kind={kind} kinds={kinds} />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {new Date(createdAt).toLocaleString("ru-RU")}
          </span>
        </span>
        <CalculationStatus status={status} />
      </Link>
    </li>
  );
}

export function AccountOverviewPage() {
  const recent = useCalculations();
  const active = useActiveCalculations();
  const {
    kinds,
    error: kindsError,
    reload: reloadKinds,
  } = useCalculationKinds();
  const recentJobs = recent.jobs.slice(0, 4);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
            Обзор исследований
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Создавайте новые или просматривайте выполненные расчеты.
          </p>
        </div>
        <DialogTrigger asChild>
          <Button type="button">Новый расчёт</Button>
        </DialogTrigger>
      </div>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="shoreline-demo-heading">
        <p className="text-sm font-medium text-primary">Интерактивная карта</p>
        <h2 id="shoreline-demo-heading" className="mt-1 text-xl font-semibold">
          Реплей береговой линии у Сочи
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Откройте сохраненные состояния модели CERC,
          проиграйте их по времени и выберите узел на карте. Свой расчёт не требуется.
        </p>
        <Button asChild className="mt-4">
          <Link to="/lab/shoreline">Открыть карту и реплей</Link>
        </Button>
      </section>

      {(active.error || recent.error || kindsError) && (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
        >
          {active.error || recent.error || kindsError}
          <div className="mt-2 flex flex-wrap gap-2">
            {active.error && (
              <Button variant="link" className="h-auto p-0" onClick={active.reload}>
                Повторить загрузку активных расчётов
              </Button>
            )}
            {recent.error && (
              <Button variant="link" className="h-auto p-0" onClick={recent.reload}>
                Повторить загрузку недавних расчётов
              </Button>
            )}
            {kindsError && (
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={reloadKinds}
              >
                Повторить загрузку сценариев
              </Button>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="active-calculations-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="active-calculations-heading"
            className="text-xl font-semibold"
          >
            Сейчас выполняются
          </h2>
          <Link
            to="/lab/calculations"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Вся история
          </Link>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Одновременно можно иметь до 5 расчётов в очереди или в работе. Если
          лимит достигнут, дождитесь завершения или отмените один из них.
        </p>
        {active.loading && !active.loaded ? (
          <p role="status" className="text-muted-foreground">
            Загружаем активные расчёты…
          </p>
        ) : active.error && active.jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
            Сведения об активных расчётах временно недоступны.
          </p>
        ) : active.jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
            Нет активных расчётов. Новый запуск появится здесь сразу после
            постановки в очередь.
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {active.error
                ? "Показаны последние полученные данные; обновление не удалось."
                : active.totalCount > active.jobs.length
                  ? `Показано ${active.jobs.length} из ${active.totalCount} активных расчётов.`
                  : `Активных расчётов: ${active.jobs.length}.`}
            </p>
            <ul className="space-y-3">
              {active.jobs.map((job) => (
                <JobLink key={job.id} {...job} kinds={kinds} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="recent-calculations-heading">
        <h2
          id="recent-calculations-heading"
          className="mb-3 text-xl font-semibold"
        >
          Недавние расчёты
        </h2>
        {recent.loading && !recent.loaded ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : recent.error && recentJobs.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
            Сведения о недавних расчётах временно недоступны.
          </p>
        ) : recentJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-muted-foreground">
            Пока нет расчётов. Выберите сценарий и запустите первый.
          </div>
        ) : (
          <>
            {recent.error && (
              <p className="mb-3 text-sm text-muted-foreground">
                Показаны последние полученные данные; обновление не удалось.
              </p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {recentJobs.map((job) => (
                <JobLink key={job.id} {...job} kinds={kinds} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
