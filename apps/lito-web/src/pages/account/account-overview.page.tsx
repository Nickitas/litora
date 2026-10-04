import { Link } from "react-router-dom";
import type {
  CalculationKindDto,
  CalculationStatus as Status,
} from "@litora/contracts";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { Button } from "@/shared/shadcn/components/ui/button";
import { DialogTrigger } from "@/shared/shadcn/components/ui/dialog";
import {
  isActiveCalculation,
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
        to={`/account/calculations/${id}`}
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
  const { jobs, loading, error, reload } = useCalculations();
  const {
    kinds,
    error: kindsError,
    reload: reloadKinds,
  } = useCalculationKinds();
  const activeJobs = jobs.filter(isActiveCalculation).slice(0, 3);
  const recentJobs = jobs.slice(0, 4);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
            Обзор исследований
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Продолжайте активные расчёты или начните новый сценарий с понятными
            ограничениями и входными данными.
          </p>
        </div>
        <DialogTrigger asChild>
          <Button type="button">Новый расчёт</Button>
        </DialogTrigger>
      </div>

      {(error || kindsError) && (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
        >
          {error || kindsError}
          <div className="mt-2 flex flex-wrap gap-2">
            {error && (
              <Button variant="link" className="h-auto p-0" onClick={reload}>
                Повторить загрузку расчётов
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
            to="/account/calculations"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Вся история
          </Link>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Одновременно можно иметь до 5 расчётов в очереди или в работе. Если
          лимит достигнут, дождитесь завершения или отмените один из них. Это не
          число мест и не позиция в очереди.
        </p>
        {loading ? (
          <p role="status" className="text-muted-foreground">
            Загружаем расчёты…
          </p>
        ) : activeJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
            Нет активных расчётов. Новый запуск появится здесь сразу после
            постановки в очередь.
          </div>
        ) : (
          <ul className="space-y-3">
            {activeJobs.map((job) => (
              <JobLink key={job.id} {...job} kinds={kinds} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-calculations-heading">
        <h2
          id="recent-calculations-heading"
          className="mb-3 text-xl font-semibold"
        >
          Недавние расчёты
        </h2>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-muted-foreground">
            Пока нет расчётов. Выберите сценарий и запустите первый.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recentJobs.map((job) => (
              <JobLink key={job.id} {...job} kinds={kinds} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
