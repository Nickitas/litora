import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import type { CalculationDeletionRequestDto, CalculationJobDto } from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
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
  useCalculationKinds,
  useInfiniteCalculationHistory,
} from "./model/use-calculations";
import { CancelCalculationDialog } from "./ui/cancel-calculation-dialog";
import { CalculationHistoryTable } from "./ui/calculation-history-table";
import { HistoryDateFilter } from "./ui/history-date-filter";
import { DeleteCalculationDialog } from "./ui/delete-calculation-dialog";

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

export function CalculationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const {
    jobs,
    nextCursor,
    totalCount,
    loading,
    loadingMore,
    error,
    loadMoreError,
    loadMore,
    updateJob,
    reload,
  } = useInfiniteCalculationHistory(search);
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
  const [deletionTarget, setDeletionTarget] = useState<CalculationJobDto | "all">();
  const [deletionRequest, setDeletionRequest] = useState<CalculationDeletionRequestDto>();
  const [deletionPollError, setDeletionPollError] = useState("");
  const deletionRequestId = deletionRequest?.id;
  const deletionRequestStatus = deletionRequest?.status;
  const [quickViewJobId, setQuickViewJobId] = useState<string>();
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const clearAllButtonRef = useRef<HTMLButtonElement | null>(null);
  const loadMoreBoundaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void api.currentCalculationDeletionRequest().then((request) => {
      if (mounted && request) setDeletionRequest((current) => current ?? request);
    }).catch(() => {
      // Ошибка чтения очереди не должна скрывать основную историю.
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const boundary = loadMoreBoundaryRef.current;
    if (
      !boundary ||
      typeof IntersectionObserver === "undefined" ||
      !nextCursor ||
      loading ||
      loadingMore ||
      loadMoreError
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(boundary);
    return () => observer.disconnect();
  }, [loadMore, loadMoreError, loading, loadingMore, nextCursor]);

  useEffect(() => {
    const requestId = deletionRequestId;
    if (!requestId || deletionRequestStatus === "completed") return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll(id: string) {
      try {
        const next = await api.calculationDeletionRequest(id);
        if (!mounted) return;
        setDeletionRequest(next);
        setDeletionPollError("");
        reload();
        if (next.status !== "completed") timer = setTimeout(() => void poll(id), 2500);
      } catch (nextError) {
        if (!mounted) return;
        setDeletionPollError(nextError instanceof Error ? nextError.message : "Не удалось проверить удаление");
        timer = setTimeout(() => void poll(id), 5000);
      }
    }
    timer = setTimeout(() => void poll(requestId), 1200);
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [deletionRequestId, deletionRequestStatus, reload]);

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

  const toggleComparison = useCallback((jobId: string) => {
    setComparisonIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId]
    );
  }, []);

  const openQuickView = useCallback(
    (jobId: string, trigger: HTMLButtonElement) => {
      returnFocusRef.current = trigger;
      setQuickViewJobId(jobId);
    },
    []
  );

  const openCancellation = useCallback(
    (job: CalculationJobDto, trigger: HTMLButtonElement) => {
      returnFocusRef.current = trigger;
      setJobForCancellation(job);
    },
    []
  );

  async function cancel(job: CalculationJobDto) {
    const updatedJob = await api.cancelCalculation(job.id);
    updateJob(updatedJob);
    reload();
  }

  const openDeletion = useCallback((job: CalculationJobDto, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    setDeletionTarget(job);
  }, []);

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
          <div className="flex flex-wrap gap-2">
            <DialogTrigger asChild>
              <Button type="button">Новый расчёт</Button>
            </DialogTrigger>
            <Button ref={clearAllButtonRef} type="button" variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget;
                setDeletionTarget("all");
              }}>
              <Trash2 aria-hidden="true" />
              Очистить историю
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground" role="status">
            {loading
              ? "Считаем подходящие расчёты…"
              : totalCount !== null
                ? `Найдено расчётов: ${totalCount}`
                : "Количество пока недоступно"}
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="history-limit">Загружать по</Label>
            <Select
              value={searchParams.get("limit") ?? "20"}
              onValueChange={(value) => changeFilter("limit", value)}
            >
              <SelectTrigger
                id="history-limit"
                aria-label="Загружать по"
                className="w-24"
              >
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
            <HistoryDateFilter
              id="history-from"
              label="С даты, UTC"
              value={searchParams.get("from") ?? ""}
              onChange={(value) => changeFilter("from", value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="history-to">По дату, UTC</Label>
            <HistoryDateFilter
              id="history-to"
              label="По дату, UTC"
              value={searchParams.get("to") ?? ""}
              onChange={(value) => changeFilter("to", value)}
            />
          </div>
        </div>
        <form
          onSubmit={searchById}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-0 basis-full space-y-2 sm:flex-1 sm:basis-auto">
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

      {deletionRequest && (
        <div role="status" aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <p>
            {deletionRequest.status === "completed" ? "Удаление завершено." : "Удаление выполняется."}
            {` Удалено ${deletionRequest.deletedCount} из ${deletionRequest.requestedCount}.`}
            {deletionRequest.retryingCount > 0 && ` Ошибки хранилища: ${deletionRequest.retryingCount}; повторим автоматически.`}
          </p>
          {deletionRequest.status === "completed" && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeletionRequest(undefined)}>
              Скрыть
            </Button>
          )}
          {deletionPollError && <p role="alert" className="basis-full text-destructive">{deletionPollError}</p>}
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
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget;
                setComparisonOpen(true);
              }}
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
          <div
            className="overflow-hidden rounded-2xl border bg-card"
            aria-hidden="true"
          >
            <div className="h-11 animate-pulse bg-muted/70 motion-reduce:animate-none" />
            <div className="h-16 animate-pulse border-t bg-muted/30 motion-reduce:animate-none" />
            <div className="h-16 animate-pulse border-t bg-muted/20 motion-reduce:animate-none" />
            <div className="h-16 animate-pulse border-t bg-muted/30 motion-reduce:animate-none" />
          </div>
        ) : error && jobs.length === 0 ? null : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-muted-foreground">
            {search
              ? "По выбранным условиям расчётов нет. Измените фильтры или вернитесь к началу истории."
              : "Пока нет расчётов. Создайте первый запуск — он появится здесь сразу после постановки в очередь."}
          </div>
        ) : (
          <CalculationHistoryTable
            jobs={jobs}
            kinds={kinds}
            comparisonIds={comparisonIds}
            onCompareChange={toggleComparison}
            onQuickView={openQuickView}
            onCancel={openCancellation}
            onDelete={openDeletion}
          />
        )}
        {jobs.length > 0 && (
          <div className="mt-4 space-y-3">
            <p
              id="history-compare-help"
              className="text-xs text-muted-foreground"
            >
              Сравнить можно два завершённых расчёта. Порядок строк — от новых к
              старым.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" role="status">
                Загружено {jobs.length}
                {totalCount !== null ? ` из ${totalCount}` : ""}
              </p>
              {searchParams.has("cursor") && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setComparisonIds([]);
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.delete("cursor");
                      return next;
                    });
                  }}
                >
                  К началу истории
                </Button>
              )}
            </div>
            {nextCursor && (
              <>
                <div
                  ref={loadMoreBoundaryRef}
                  aria-hidden="true"
                  className="h-px"
                />
                {loadingMore ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Загружаем следующую страницу…
                  </p>
                ) : loadMoreError ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center gap-3 text-sm text-destructive"
                  >
                    Не удалось загрузить ещё расчёты: {loadMoreError}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadMore()}
                    >
                      Повторить загрузку
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadMore()}
                  >
                    Загрузить ещё
                  </Button>
                )}
              </>
            )}
            {!nextCursor && (
              <p className="text-sm text-muted-foreground">
                Это все расчёты по выбранным условиям.
              </p>
            )}
          </div>
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
        onRestoreFocus={() => returnFocusRef.current?.focus()}
      />
      {deletionTarget && <DeleteCalculationDialog
        key={deletionTarget === "all" ? "all" : deletionTarget.id}
        target={deletionTarget}
        onClose={() => setDeletionTarget(undefined)}
        onQueued={(request) => {
          setDeletionRequest(request);
          setDeletionPollError("");
          setComparisonIds([]);
          reload();
        }}
        onRestoreFocus={() => {
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
          else clearAllButtonRef.current?.focus();
        }}
      />}
      {quickViewJobId && (
        <Suspense fallback={null}>
          <CalculationQuickViewDialog
            jobId={quickViewJobId}
            kinds={kinds}
            onClose={() => setQuickViewJobId(undefined)}
            onRestoreFocus={() => returnFocusRef.current?.focus()}
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
            onRestoreFocus={() => returnFocusRef.current?.focus()}
          />
        </Suspense>
      )}
    </div>
  );
}
