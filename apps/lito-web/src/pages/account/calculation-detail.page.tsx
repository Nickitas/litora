import { useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  CalculationArtifactDto,
  CalculationJobDto,
} from "@litora/contracts";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/shadcn/components/ui/collapsible";
import {
  isActiveCalculation,
  useCalculation,
  useCalculationKinds,
} from "./model/use-calculations";
import { CancelCalculationDialog } from "./ui/cancel-calculation-dialog";
import { CalculationImagePreview } from "./ui/calculation-image-preview";
import { isPreviewableImage } from "./ui/calculation-image-preview.utils";
import { CalculationMetadataDownload } from "./ui/calculation-metadata-download";
import { CalculationTitle } from "./ui/calculation-title";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textOrMissing(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value
    : "Не указано для этого запуска";
}

function dateOrMissing(value: string | null) {
  if (!value) return "Не указано";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Некорректная дата"
    : date.toLocaleString("ru-RU");
}

function fileSize(bytes: number) {
  return `${new Intl.NumberFormat("ru-RU").format(bytes)} байт`;
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2) ?? "null"}
    </pre>
  );
}

function Provenance({ value }: { value: unknown }) {
  if (!isRecord(value)) {
    return (
      <p className="text-sm text-muted-foreground">
        Происхождение входных файлов не записано для этого запуска.
      </p>
    );
  }

  const declared = isRecord(value.declaredSources)
    ? value.declaredSources
    : null;
  const files = Array.isArray(value.files) ? value.files : [];

  return (
    <div className="space-y-5">
      {typeof value.datasetId === "string" && (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <DetailField label="Набор данных">
            <code className="break-all">{value.datasetId}</code>
          </DetailField>
          <DetailField label="Версия схемы набора">
            {typeof value.datasetSchemaVersion === "number"
              ? value.datasetSchemaVersion
              : "Не указана"}
          </DetailField>
          <DetailField label="Источник (заявлен пользователем)">
            {textOrMissing(value.source)}
          </DetailField>
          <DetailField label="Версия источника (заявлена пользователем)">
            {textOrMissing(value.sourceRevision)}
          </DetailField>
          <DetailField label="Лицензия (заявлена пользователем)">
            {textOrMissing(value.license)}
          </DetailField>
          <DetailField label="CRS и единицы">
            {textOrMissing(value.crs)} · {textOrMissing(value.coordinateUnit)}
          </DetailField>
          <DetailField label="Число точек">
            {typeof value.pointCount === "number"
              ? value.pointCount
              : "Не указано"}
          </DetailField>
          <DetailField label="SHA-256 набора">
            <code className="break-all">{textOrMissing(value.sha256)}</code>
          </DetailField>
        </dl>
      )}
      {declared && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Источники демонстрационных данных указаны в поставляемом манифесте;
            это не независимая проверка их точности или лицензии.
          </p>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <DetailField label="Дата подготовки">
              {textOrMissing(declared.generatedAt)}
            </DetailField>
            <DetailField label="Береговая линия">
              {textOrMissing(declared.coastline)}
            </DetailField>
            <DetailField label="Волны">
              {textOrMissing(declared.waves)}
            </DetailField>
            <DetailField label="Батиметрия">
              {textOrMissing(declared.bathymetry)}
            </DetailField>
            <DetailField label="Сооружения">
              {textOrMissing(declared.structures)}
            </DetailField>
          </dl>
          {typeof declared.structuresWarning === "string" &&
            declared.structuresWarning && (
              <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
                {declared.structuresWarning}
              </p>
            )}
        </div>
      )}
      {files.length > 0 ? (
        <div>
          <h3 className="font-medium">Входные файлы</h3>
          <ul className="mt-3 space-y-3">
            {files.map((file, index) =>
              isRecord(file) ? (
                <li
                  key={`${String(file.path)}-${index}`}
                  className="min-w-0 rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium break-all">
                    {textOrMissing(file.filename ?? file.path)}
                  </p>
                  {typeof file.role === "string" && (
                    <p className="mt-1 text-muted-foreground">Роль: {file.role}</p>
                  )}
                  {typeof file.source === "string" && (
                    <p className="mt-1 text-muted-foreground">
                      {file.origin === "artifact" ? "Происхождение: " : "Источник (заявлен пользователем): "}{file.source}
                    </p>
                  )}
                  {file.origin === "artifact" && typeof file.sourceJobId === "string" &&
                    uuidPattern.test(file.sourceJobId) && (
                    <p className="mt-1 text-muted-foreground">
                      Паспорт и права на исходные данные смотрите в{" "}
                      <Link className="text-primary underline underline-offset-2"
                        to={`/account/calculations/${file.sourceJobId}`}>
                        исходном расчёте
                      </Link>.
                    </p>
                  )}
                  {typeof file.license === "string" && (
                    <p className="mt-1 text-muted-foreground">Лицензия (заявлена пользователем): {file.license}</p>
                  )}
                  <p className="mt-1 text-muted-foreground">
                    {typeof file.sizeBytes === "number"
                      ? fileSize(file.sizeBytes)
                      : "Размер не указан"}
                  </p>
                  <p className="mt-1 font-mono text-xs break-all">
                    SHA-256: {textOrMissing(file.sha256)}
                  </p>
                </li>
              ) : null
            )}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Список входных файлов не записан.
        </p>
      )}
    </div>
  );
}

function ArtifactList({ files }: { files: CalculationArtifactDto[] }) {
  if (files.length === 0)
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Для этого расчёта пока нет опубликованных файлов.
      </p>
    );

  return (
    <ul className="mt-4 grid gap-3 lg:grid-cols-2">
      {files.map((file) => (
        <li key={file.id} className="min-w-0 rounded-xl border p-4 text-sm">
          <a
            className="font-medium break-all text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={file.downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            {file.filename}
          </a>
          <p className="mt-2 text-muted-foreground">
            {file.category === "log"
              ? "Журнал"
              : file.category === "output"
                ? "Результат"
                : file.category}{" "}
            · {file.contentType} · {fileSize(file.sizeBytes)}
          </p>
          <p className="mt-2 font-mono text-xs break-all">
            SHA-256: {file.sha256}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CalculationDetailPage() {
  const { jobId } = useParams();
  if (!jobId) return <Navigate to="/account/calculations" replace />;
  return <CalculationDetail key={jobId} jobId={jobId} />;
}

function CalculationDetail({ jobId }: { jobId: string }) {
  const { job, loading, error, reload } = useCalculation(jobId);
  const { kinds } = useCalculationKinds();
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  async function cancel(selectedJob: CalculationJobDto) {
    await api.cancelCalculation(selectedJob.id);
    reload();
  }

  const summary = job?.resultSummary;
  const images = job?.artifacts.filter(isPreviewableImage);

  return (
    <section className="min-w-0 space-y-6" aria-label="Результат расчёта">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/account/calculations"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            ← К истории расчётов
          </Link>
          <h1 className="mt-3 text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
            {job ? (
              <CalculationTitle kind={job.kind} kinds={kinds} />
            ) : (
              "Расчёт"
            )}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Результат, входные данные и технический паспорт запуска.
          </p>
        </div>
        {job && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={`/account/calculations?repeat=${job.id}`}>
                Создать на основе
              </Link>
            </Button>
            {isActiveCalculation(job) && (
              <Button
                ref={cancelButtonRef}
                variant="destructive"
                onClick={() => setCancelOpen(true)}
              >
                Отменить расчёт
              </Button>
            )}
          </div>
        )}
      </div>

      {loading && !job ? (
        <p role="status">Загружаем расчёт…</p>
      ) : error && !job ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
        >
          {error}
          <Button variant="link" className="ml-2 h-auto p-0" onClick={reload}>
            Повторить
          </Button>
        </div>
      ) : job ? (
        <>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
            >
              Не удалось обновить состояние: {error}
              <Button
                variant="link"
                className="ml-2 h-auto p-0"
                onClick={reload}
              >
                Повторить
              </Button>
            </div>
          )}

          <section
            className="space-y-5 rounded-2xl border bg-card p-5 text-card-foreground"
            aria-labelledby="calculation-summary-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="calculation-summary-heading"
                className="text-xl font-semibold"
              >
                Состояние и результат
              </h2>
              <div aria-live="polite">
                <CalculationStatus status={job.status} />
              </div>
            </div>
            {job.kind === "erosion" && (
              <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
                Демонстрационный сценарий. Не является прогнозом годового
                размыва или калиброванным научным отчётом.
              </p>
            )}
            {job.errorMessage && (
              <p
                role="alert"
                className="text-sm whitespace-pre-wrap text-destructive"
              >
                {job.errorMessage}
              </p>
            )}
            {summary?.scientificAccepted === false && (
              <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
                Go сохранил диагностические файлы, но научные критерии не пройдены.
                Используйте отчёт и журнал для проверки причин; эти файлы не подтверждают пригодность модели.
              </p>
            )}
            {isActiveCalculation(job) ? (
              <p role="status" className="text-sm text-muted-foreground">
                Результаты появятся здесь автоматически после выполнения.
              </p>
            ) : summary ? (
              <div className="space-y-4">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <DetailField label="Файлов результата">
                    {typeof summary.fileCount === "number"
                      ? summary.fileCount
                      : "Не указано"}
                  </DetailField>
                  <DetailField label="Объём результата">
                    {typeof summary.totalBytes === "number"
                      ? fileSize(summary.totalBytes)
                      : "Не указан"}
                  </DetailField>
                </dl>
                {summary.metrics !== undefined && (
                  <div>
                    <h3 className="mb-2 font-medium">
                      JSON-данные файлов результата
                    </h3>
                    <JsonBlock value={summary.metrics} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Содержимое показано без интерпретации и дополнительного
                      пересчёта в браузере.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Сводка результата не записана для этого запуска.
              </p>
            )}
          </section>

          {images && images.length > 0 && (
            <section aria-labelledby="visual-reports-heading">
              <h2
                id="visual-reports-heading"
                className="mb-3 text-xl font-semibold"
              >
                Визуальные отчёты
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {images.map((file) => (
                  <CalculationImagePreview
                    key={file.id}
                    file={file}
                    alt={`Отчёт: ${file.filename}`}
                    onRefreshLinks={reload}
                  />
                ))}
              </div>
            </section>
          )}

          <section
            className="rounded-2xl border bg-card p-5 text-card-foreground"
            aria-labelledby="calculation-files-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="calculation-files-heading"
                className="text-xl font-semibold"
              >
                Файлы результата
              </h2>
              {job.artifacts.length > 0 && (
                <Button variant="outline" size="sm" onClick={reload}>
                  Обновить ссылки
                </Button>
              )}
            </div>
            <ArtifactList files={job.artifacts} />
            {job.artifacts.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Ссылки на приватные файлы действуют ограниченное время. Если
                загрузка не началась, обновите ссылки.
              </p>
            )}
          </section>

          <section
            className="space-y-5 rounded-2xl border bg-card p-5 text-card-foreground"
            aria-labelledby="calculation-input-heading"
          >
            <h2
              id="calculation-input-heading"
              className="text-xl font-semibold"
            >
              Вход и происхождение данных
            </h2>
            <div>
              <h3 className="mb-2 font-medium">Параметры запуска</h3>
              <JsonBlock value={job.input} />
            </div>
            <Provenance value={summary?.provenance} />
          </section>

          <section
            className="space-y-4 rounded-2xl border bg-card p-5 text-card-foreground"
            aria-labelledby="calculation-versions-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="calculation-versions-heading"
                className="text-xl font-semibold"
              >
                Метод и версии
              </h2>
              <CalculationMetadataDownload job={job} />
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <DetailField label="Метод">
                <code className="break-all">{textOrMissing(job.methodId)}</code>
              </DetailField>
              <DetailField label="Ревизия метода">
                <code className="break-all">
                  {textOrMissing(job.methodRevision)}
                </code>
              </DetailField>
              <DetailField label="Версия схемы входа">
                {job.inputSchemaVersion ?? "Не указана"}
              </DetailField>
              <DetailField label="Версия схемы результата">
                {job.resultSchemaVersion ?? "Не указана"}
              </DetailField>
              <DetailField label="SHA-256 исполняемого ядра">
                <code className="break-all">
                  {textOrMissing(job.coreVersion)}
                </code>
              </DetailField>
              <DetailField label="UUID расчёта">
                <code className="break-all">{job.id}</code>
              </DetailField>
              <DetailField label="Создан">
                {dateOrMissing(job.createdAt)}
              </DetailField>
              <DetailField label="Начат">
                {dateOrMissing(job.startedAt)}
              </DetailField>
              <DetailField label="Завершён">
                {dateOrMissing(job.finishedAt)}
              </DetailField>
              <DetailField label="Обновлён">
                {dateOrMissing(job.updatedAt)}
              </DetailField>
            </dl>
            <p className="text-xs text-muted-foreground">
              Паспорт JSON содержит метаданные и контрольные суммы без самих
              файлов и временных ссылок на них.
            </p>
            <p className="text-xs text-muted-foreground">
              Ревизия реализации не означает научную аттестацию. Точный повтор
              исторической версии ядра пока недоступен.
            </p>
          </section>

          <Collapsible className="rounded-2xl border bg-card p-5 text-card-foreground">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start px-0 font-medium"
              >
                Исходные поля результата JSON
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3">
                <JsonBlock value={summary} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : null}
      <CancelCalculationDialog
        job={job}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={cancel}
        title="Отменить расчёт"
        onRestoreFocus={() => cancelButtonRef.current?.focus()}
      />
    </section>
  );
}
