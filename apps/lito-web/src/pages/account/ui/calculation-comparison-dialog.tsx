import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/shadcn/components/ui/dialog";
import { CalculationTitle } from "./calculation-title";

function reportsAreComparable(
  left: CalculationJobDto,
  right: CalculationJobDto
) {
  return (
    left.status === "succeeded" &&
    right.status === "succeeded" &&
    left.kind === right.kind &&
    left.resultSchemaVersion !== null &&
    left.resultSchemaVersion === right.resultSchemaVersion
  );
}

function ReportColumn({
  job,
  label,
  kinds,
  onClose,
}: {
  job: CalculationJobDto;
  label: string;
  kinds: CalculationKindDto[];
  onClose: () => void;
}) {
  const image = job.artifacts.find((file) =>
    file.contentType.startsWith("image/")
  );

  return (
    <article className="min-w-0 space-y-4 rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <CalculationStatus status={job.status} />
      </div>
      <div>
        <h3 className="font-semibold">
          <CalculationTitle kind={job.kind} kinds={kinds} />
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(job.createdAt).toLocaleString("ru-RU")}
        </p>
      </div>
      {image ? (
        <figure className="overflow-hidden rounded-lg border">
          <img
            src={image.downloadUrl}
            alt={`Отчёт ${label.toLowerCase()}: ${image.filename}`}
            className="max-h-72 w-full bg-white object-contain"
            loading="lazy"
          />
          <figcaption className="p-2 text-xs text-muted-foreground">
            {image.filename}
          </figcaption>
        </figure>
      ) : (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Визуальный отчёт не опубликован.
        </p>
      )}
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Метод</dt>
          <dd className="text-right break-all">
            {job.methodId ?? "не указан"}
            {job.methodRevision ? ` · ${job.methodRevision}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Схема результата</dt>
          <dd>{job.resultSchemaVersion ?? "не указана"}</dd>
        </div>
      </dl>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start px-0 font-medium">
            Вход и метрики JSON
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">
          {JSON.stringify(
            { input: job.input, result: job.resultSummary },
            null,
            2
          )}
        </pre>
        </CollapsibleContent>
      </Collapsible>
      <Link
        to={`/account/calculations/${job.id}`}
        onClick={onClose}
        className="inline-flex text-sm text-primary underline-offset-4 hover:underline"
      >
        Открыть полный отчёт
      </Link>
    </article>
  );
}

export function CalculationComparisonDialog({
  leftJobId,
  rightJobId,
  kinds,
  onClose,
}: {
  leftJobId: string;
  rightJobId: string;
  kinds: CalculationKindDto[];
  onClose: () => void;
}) {
  const [jobs, setJobs] = useState<[CalculationJobDto, CalculationJobDto]>();
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void Promise.all([api.calculation(leftJobId), api.calculation(rightJobId)])
      .then(([left, right]) => {
        if (mounted) setJobs([left, right]);
      })
      .catch((nextError: unknown) => {
        if (mounted)
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Не удалось загрузить отчёты"
          );
      });
    return () => {
      mounted = false;
    };
  }, [leftJobId, rightJobId]);

  const comparable = jobs ? reportsAreComparable(...jobs) : false;
  const methodsDiffer =
    jobs?.[0].methodId !== jobs?.[1].methodId ||
    jobs?.[0].methodRevision !== jobs?.[1].methodRevision;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl overflow-y-auto p-0">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-2xl font-semibold">
              Сравнение отчётов
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Отчёты показаны рядом без вычисления новых научных показателей.
              Полное сравнение метрик требует серверной проверки совместимости.
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-status-failed-background p-4 text-sm text-status-failed"
          >
            {error}
          </p>
        ) : !jobs ? (
          <p role="status" className="text-muted-foreground">
            Загружаем выбранные отчёты…
          </p>
        ) : !comparable ? (
          <div
            role="alert"
            className="rounded-xl border border-warning bg-warning-background p-4 text-sm text-warning"
          >
            Эти отчёты нельзя сопоставить: нужны два завершённых запуска одного
            типа и одной версии схемы результата. Откройте их полные страницы
            для отдельного просмотра.
          </div>
        ) : (
          <>
            {methodsDiffer && (
              <p className="rounded-xl border border-warning bg-warning-background p-4 text-sm text-warning">
                Метод или его ревизия различаются. Сопоставляйте значения только
                с учётом этого отличия.
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <ReportColumn
                job={jobs[0]}
                label="Отчёт A"
                kinds={kinds}
                onClose={onClose}
              />
              <ReportColumn
                job={jobs[1]}
                label="Отчёт B"
                kinds={kinds}
                onClose={onClose}
              />
            </div>
          </>
        )}
      </div>
      </DialogContent>
    </Dialog>
  );
}
