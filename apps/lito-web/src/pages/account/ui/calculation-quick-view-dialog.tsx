import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { CalculationJobDto, CalculationKindDto } from "@litora/contracts";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/shadcn/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/shadcn/components/ui/dialog";
import { CalculationTitle } from "./calculation-title";

export function CalculationQuickViewDialog({
  jobId,
  kinds,
  onClose,
  onRestoreFocus,
}: {
  jobId: string;
  kinds: CalculationKindDto[];
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const [job, setJob] = useState<CalculationJobDto>();
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void api
      .calculation(jobId)
      .then((result) => {
        if (mounted) setJob(result);
      })
      .catch((nextError: unknown) => {
        if (mounted)
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Не удалось открыть расчёт"
          );
      });
    return () => {
      mounted = false;
    };
  }, [jobId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto p-0"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-2xl font-semibold">
                {job ? (
                  <CalculationTitle kind={job.kind} kinds={kinds} />
                ) : (
                  "Расчёт"
                )}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                Краткий просмотр статуса, параметров и опубликованных
                результатов.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Закрыть краткий просмотр"
                className="size-11"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-status-failed-background p-4 text-sm text-status-failed"
            >
              {error}
            </p>
          ) : !job ? (
            <p role="status" className="text-muted-foreground">
              Загружаем расчёт…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <CalculationStatus status={job.status} />
                <span className="text-sm text-muted-foreground">
                  {new Date(job.createdAt).toLocaleString("ru-RU")}
                </span>
              </div>
              {job.errorMessage && (
                <p
                  role="alert"
                  className="text-sm whitespace-pre-wrap text-destructive"
                >
                  {job.errorMessage}
                </p>
              )}
              {job.resultSummary?.scenario === "demo" && (
                <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
                  Демонстрационный сценарий: это не прогноз годового размыва и
                  не калиброванный научный отчёт.
                </p>
              )}
              <Collapsible className="rounded-xl border bg-card p-4 text-card-foreground">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start px-0 font-medium"
                  >
                    Параметры и метрики JSON
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
                    {JSON.stringify(
                      {
                        input: job.input,
                        result: job.resultSummary,
                        methodId: job.methodId,
                        methodRevision: job.methodRevision,
                      },
                      null,
                      2
                    )}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
              <p className="text-sm text-muted-foreground">
                Опубликовано файлов: {job.artifacts.length}.
              </p>
              <Button asChild>
                <Link to={`/account/calculations/${job.id}`} onClick={onClose}>
                  Открыть полную страницу
                </Link>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
