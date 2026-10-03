import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CalculationJobDto, CalculationKindDto } from "@litora/contracts";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Checkbox } from "@/shared/shadcn/components/ui/checkbox";
import { DialogTrigger } from "@/shared/shadcn/components/ui/dialog";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/components/ui/select";
import {
  isActiveCalculation,
  useCalculationKinds,
  useCalculationPage,
} from "./model/use-calculations";
import { CancelCalculationDialog } from "./ui/cancel-calculation-dialog";
import { CalculationTitle } from "./ui/calculation-title";

const CalculationQuickViewDialog = lazy(() =>
  import("./ui/calculation-quick-view-dialog").then((m) => ({
    default: m.CalculationQuickViewDialog,
  }))
);
const CalculationComparisonDialog = lazy(() =>
  import("./ui/calculation-comparison-dialog").then((m) => ({
    default: m.CalculationComparisonDialog,
  }))
);

function CalculationCard({
  job,
  kinds,
  comparisonIds,
  onCompareChange,
  onQuickView,
  onCancel,
}: {
  job: CalculationJobDto;
  kinds: CalculationKindDto[];
  comparisonIds: string[];
  onCompareChange: (jobId: string) => void;
  onQuickView: (jobId: string) => void;
  onCancel: (job: CalculationJobDto) => void;
}) {
  const comparisonSelected = comparisonIds.includes(job.id);
  const comparisonUnavailable =
    job.status !== "succeeded" ||
    (comparisonIds.length === 2 && !comparisonSelected);
  const compareControlId = `compare-${job.id}`;

  return (
    <li className="rounded-2xl border bg-card p-4 text-card-foreground transition-colors hover:border-primary/40 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            <CalculationTitle kind={job.kind} kinds={kinds} />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(job.createdAt).toLocaleString("ru-RU")}
          </p>
        </div>
        <CalculationStatus status={job.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Label
          htmlFor={compareControlId}
          className={`flex min-h-11 items-center gap-2 text-sm ${
            comparisonUnavailable
              ? "cursor-not-allowed text-muted-foreground"
              : "cursor-pointer"
          }`}
        >
          <Checkbox
            id={compareControlId}
            checked={comparisonSelected}
            disabled={comparisonUnavailable}
            onCheckedChange={() => onCompareChange(job.id)}
          />
          Сравнить
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onQuickView(job.id)}
          >
            Кратко
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/account/calculations/${job.id}`}>Открыть</Link>
          </Button>
          {isActiveCalculation(job) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => onCancel(job)}
            >
              Отменить
            </Button>
          )}
        </div>
      </div>
      {job.status !== "succeeded" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Для сравнения нужны два готовых отчёта.
        </p>
      )}
    </li>
  );
}

export function CalculationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const { page, loading, error, reload } = useCalculationPage(search);
  const jobs = page?.items ?? [];
  const { kinds } = useCalculationKinds();
  const selectedJobId = searchParams.get("jobId") ?? "";
  const [searchDraft, setSearchDraft] = useState({
    urlValue: selectedJobId,
    draft: selectedJobId,
  });
  const jobIdDraft =
    searchDraft.urlValue === selectedJobId ? searchDraft.draft : selectedJobId;
  const [jobForCancellation, setJobForCancellation] =
    useState<CalculationJobDto>();
  const [quickViewJobId, setQuickViewJobId] = useState<string>();
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  function changeFilter(name: string, value: string) {
    setComparisonIds([]);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete("cursor");
      return next;
    });
  }

  function searchById(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changeFilter("jobId", jobIdDraft.trim());
  }

  function goToCursor(cursor: string | null) {
    setComparisonIds([]);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (cursor) next.set("cursor", cursor);
      else next.delete("cursor");
      return next;
    });
  }

  function toggleComparison(jobId: string) {
    setComparisonIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId]
    );
  }

  async function cancel(job: CalculationJobDto) {
    await api.cancelCalculation(job.id);
    reload();
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-2xl border bg-card p-5 text-card-foreground sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Рабочий журнал</p>
            <h1 className="mt-1 text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
              Расчёты
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Открывайте полный отчёт, просматривайте ключевые сведения в
              модальном окне и сопоставляйте два совместимых результата.
            </p>
          </div>
          <DialogTrigger asChild>
            <Button type="button">Новый расчёт</Button>
          </DialogTrigger>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground" role="status">
            {loading && !page
              ? "Считаем подходящие расчёты…"
              : page
                ? `Найдено расчётов: ${page.totalCount}`
                : "Количество пока недоступно"}
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="history-limit">На странице</Label>
            <Select
              value={searchParams.get("limit") ?? "20"}
              onValueChange={(value) => changeFilter("limit", value)}
            >
              <SelectTrigger id="history-limit" aria-label="На странице" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <section
        aria-label="Фильтры истории"
        className="rounded-2xl border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="history-status">Статус</Label>
            <Select
              value={searchParams.get("status") || "__all__"}
              onValueChange={(value) =>
                changeFilter("status", value === "__all__" ? "" : value)
              }
            >
              <SelectTrigger id="history-status" aria-label="Статус">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Все статусы</SelectItem>
                <SelectItem value="queued">В очереди</SelectItem>
                <SelectItem value="running">Выполняется</SelectItem>
                <SelectItem value="succeeded">Завершён</SelectItem>
                <SelectItem value="failed">Ошибка</SelectItem>
                <SelectItem value="cancelled">Отменён</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="history-kind">Сценарий</Label>
            <Select
              value={searchParams.get("kind") || "__all__"}
              onValueChange={(value) =>
                changeFilter("kind", value === "__all__" ? "" : value)
              }
            >
              <SelectTrigger id="history-kind" aria-label="Сценарий">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Все сценарии</SelectItem>
                {kinds.map((item) => (
                  <SelectItem key={item.kind} value={item.kind}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="history-from">С даты, UTC</Label>
            <Input
              id="history-from"
              type="date"
              value={searchParams.get("from") ?? ""}
              onChange={(event) => changeFilter("from", event.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="history-to">По дату, UTC</Label>
            <Input
              id="history-to"
              type="date"
              value={searchParams.get("to") ?? ""}
              onChange={(event) => changeFilter("to", event.target.value)}
            />
          </div>
        </div>
        <form
          onSubmit={searchById}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="history-job-id">Поиск по UUID расчёта</Label>
            <Input
              id="history-job-id"
              value={jobIdDraft}
              onChange={(event) =>
                setSearchDraft({
                  urlValue: selectedJobId,
                  draft: event.target.value,
                })
              }
              placeholder="Например, 123e4567-e89b-42d3-a456-426614174000"
            />
          </div>
          <Button type="submit" variant="outline">
            Найти
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchDraft({ urlValue: "", draft: "" });
                setComparisonIds([]);
                setSearchParams({});
              }}
            >
              Сбросить фильтры
            </Button>
          )}
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Поиск по названию пока недоступен: у расчётов нет пользовательских
          названий.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
        >
          {error}
          <Button variant="link" className="ml-2 h-auto p-0" onClick={reload}>
            Повторить
          </Button>
        </div>
      )}

      {comparisonIds.length > 0 && (
        <section
          aria-label="Выбор для сравнения"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent p-4 text-accent-foreground"
        >
          <p className="text-sm font-medium">
            Выбрано для сравнения: {comparisonIds.length} из 2
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={comparisonIds.length !== 2}
              onClick={() => setComparisonOpen(true)}
            >
              {comparisonIds.length === 2
                ? "Сравнить отчёты"
                : "Выберите ещё один отчёт"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setComparisonOpen(false);
                setComparisonIds([]);
              }}
            >
              Очистить
            </Button>
          </div>
        </section>
      )}

      <section aria-label="История расчётов">
        {loading ? (
          <div className="grid gap-3" aria-hidden="true">
            <div className="h-36 animate-pulse rounded-2xl bg-muted" />
            <div className="h-36 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-muted-foreground">
            {search
              ? "По выбранным условиям расчётов нет. Измените фильтры или вернитесь к началу истории."
              : "Пока нет расчётов. Создайте первый запуск — он появится здесь сразу после постановки в очередь."}
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <CalculationCard
                key={job.id}
                job={job}
                kinds={kinds}
                comparisonIds={comparisonIds}
                onCompareChange={toggleComparison}
                onQuickView={setQuickViewJobId}
                onCancel={setJobForCancellation}
              />
            ))}
          </ul>
        )}
        {page && (page.nextCursor || searchParams.has("cursor")) && (
          <nav
            aria-label="Страницы истории"
            className="mt-5 flex flex-wrap items-center gap-3"
          >
            {searchParams.has("cursor") && (
              <Button variant="outline" onClick={() => goToCursor(null)}>
                К первой странице
              </Button>
            )}
            {page.nextCursor && (
              <Button
                variant="outline"
                onClick={() => goToCursor(page.nextCursor)}
              >
                Следующая страница
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Показано на странице: {jobs.length}
            </span>
          </nav>
        )}
      </section>
      <CancelCalculationDialog
        job={jobForCancellation}
        open={Boolean(jobForCancellation)}
        onOpenChange={(open) => {
          if (!open) setJobForCancellation(undefined);
        }}
        onConfirm={cancel}
        title="Отменить расчёт"
      />
      {quickViewJobId && (
        <Suspense fallback={null}>
          <CalculationQuickViewDialog
            jobId={quickViewJobId}
            kinds={kinds}
            onClose={() => setQuickViewJobId(undefined)}
          />
        </Suspense>
      )}
      {comparisonOpen && comparisonIds.length === 2 && (
        <Suspense fallback={null}>
          <CalculationComparisonDialog
            leftJobId={comparisonIds[0]}
            rightJobId={comparisonIds[1]}
            kinds={kinds}
            onClose={() => setComparisonOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
