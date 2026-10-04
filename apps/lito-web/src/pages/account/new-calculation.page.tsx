import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  CalculationKind,
  CalculationKindDto,
  DatasetDto,
} from "@litora/contracts";
import { defaultCoastlineDataset } from "@litora/generated-data";
import { ArrowUpRight, Database, FilePlus2, X } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/shadcn/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/components/ui/select";
import { errorMessage } from "./model/use-calculations";
import { scenarioGuidance } from "./model/scenario-guidance";
import { DatasetUpload } from "./ui/dataset-upload";

export function NewCalculationDialog({
  onOpenChange,
  onRestoreFocus,
}: {
  onOpenChange: (open: boolean) => void;
  onRestoreFocus: () => void;
}) {
  const navigate = useNavigate();
  const [kinds, setKinds] = useState<CalculationKindDto[]>([]);
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [kind, setKind] = useState<CalculationKind>("dimension");
  const [datasetId, setDatasetId] = useState("");
  const [datasetSelectOpen, setDatasetSelectOpen] = useState(false);
  const [steps, setSteps] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [revision, setRevision] = useState(0);
  const [datasetUploadOpen, setDatasetUploadOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all([api.calculationKinds(), api.datasets()])
      .then(([nextKinds, nextDatasets]) => {
        if (!mounted) return;
        setKinds(nextKinds);
        setDatasets(nextDatasets);
        setKind((current) =>
          nextKinds.some((item) => item.kind === current)
            ? current
            : (nextKinds[0]?.kind ?? current)
        );
        setLoadError("");
      })
      .catch((nextError: unknown) => {
        if (mounted) setLoadError(errorMessage(nextError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [revision]);

  function reload() {
    setLoading(true);
    setLoadError("");
    setRevision((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kinds.some((item) => item.kind === kind)) return;
    setBusy(true);
    setSubmitError("");
    try {
      let selectedDatasetId = datasetId;
      if (kind === "dimension_dataset" && !selectedDatasetId) {
        const example = await api.createDataset(defaultCoastlineDataset);
        setDatasets((current) => [example, ...current]);
        setDatasetId(example.id);
        selectedDatasetId = example.id;
      }
      const job = await api.createCalculation({
        kind,
        input:
          kind === "erosion"
            ? { steps }
            : kind === "dimension_dataset"
              ? { datasetId: selectedDatasetId }
              : {},
      });
      onOpenChange(false);
      navigate(`/account/calculations/${job.id}`);
    } catch (nextError) {
      setSubmitError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  const scenario = kinds.find((item) => item.kind === kind);
  const guidance = scenario ? scenarioGuidance[scenario.kind] : undefined;
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const isDatasetCalculation = kind === "dimension_dataset";

  return (
    <DialogContent
      aria-modal="true"
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden p-0"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus();
      }}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <header className="shrink-0 border-b px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database aria-hidden="true" className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Исследование
              </p>
              <DialogTitle className="mt-1 text-2xl font-semibold sm:text-3xl">
                Новый расчёт
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Выберите сценарий и входные данные. Задание попадёт в очередь
                только после запуска.
              </DialogDescription>
            </div>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              aria-label="Закрыть окно нового расчёта"
              className="size-11 p-0"
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
      </header>

      <div
        data-slot="calculation-dialog-body"
        className="min-h-0 space-y-6 overflow-y-auto px-5 py-6 sm:px-6"
      >
        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
          >
            <p>{loadError}</p>
            <Button
              type="button"
              variant="link"
              className="mt-2 h-auto p-0"
              onClick={reload}
            >
              Повторить загрузку
            </Button>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
          >
            <p>{submitError}</p>
            <p className="mt-1 text-sm">
              Параметры сохранены. Попробуйте запустить расчёт ещё раз.
            </p>
          </div>
        )}

        <form
          id="new-calculation-form"
          onSubmit={(event) => void submit(event)}
          className="space-y-6"
          aria-busy={busy}
        >
          {loading ? (
            <div className="rounded-xl border border-dashed p-6" role="status">
              <p className="font-medium">Готовим форму расчёта…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Получаем доступные сценарии и ваши наборы данных.
              </p>
            </div>
          ) : (
            <>
              <section aria-labelledby="calculation-scenario-heading">
                <div className="flex items-baseline justify-between gap-4">
                  <h3
                    id="calculation-scenario-heading"
                    className="text-lg font-semibold"
                  >
                    1. Сценарий
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Доступен
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="calculation-kind">Что рассчитать</Label>
                  <Select
                    value={kind}
                    disabled={!kinds.length}
                    onValueChange={(value) => {
                      setKind(value as CalculationKind);
                      setDatasetUploadOpen(false);
                    }}
                  >
                    <SelectTrigger
                      id="calculation-kind"
                      aria-label="Что рассчитать"
                    >
                      <SelectValue placeholder="Выберите сценарий" />
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((item) => (
                        <SelectItem key={item.kind} value={item.kind}>
                          {item.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!kinds.length && !loadError && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Сейчас нет доступных сценариев для запуска.
                  </p>
                )}
                {scenario && (
                  <div
                    className="mt-4 space-y-4 rounded-xl border bg-card p-4"
                    aria-live="polite"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{scenario.title}</p>
                      {kind === "erosion" && (
                        <span className="rounded-full bg-warning-background px-2.5 py-1 text-xs font-semibold text-warning">
                          Демонстрационный сценарий
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {scenario.description}
                    </p>
                    {guidance && (
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-medium">Входные данные</dt>
                          <dd className="mt-1 text-muted-foreground">
                            {guidance.source}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">Ограничение</dt>
                          <dd className="mt-1 text-muted-foreground">
                            {guidance.limitation}
                          </dd>
                        </div>
                      </dl>
                    )}
                    {guidance && (
                      <Link
                        to={guidance.reference.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {guidance.reference.label}
                        <ArrowUpRight aria-hidden="true" className="size-4" />
                        <span className="sr-only">
                          (откроется в новой вкладке)
                        </span>
                      </Link>
                    )}
                  </div>
                )}
              </section>

              {kind === "erosion" && (
                <section
                  aria-labelledby="calculation-parameters-heading"
                  className="border-t pt-6"
                >
                  <h3
                    id="calculation-parameters-heading"
                    className="text-lg font-semibold"
                  >
                    2. Параметры
                  </h3>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="erosion-steps">
                      Шаги волнового ряда (1–48)
                    </Label>
                    <Input
                      id="erosion-steps"
                      type="number"
                      min={1}
                      max={48}
                      required
                      value={steps}
                      onChange={(event) => setSteps(Number(event.target.value))}
                    />
                  </div>
                </section>
              )}

              {isDatasetCalculation && (
                <section
                  aria-labelledby="calculation-data-heading"
                  className="border-t pt-6"
                >
                  <h3
                    id="calculation-data-heading"
                    className="text-lg font-semibold"
                  >
                    2. Береговая линия
                  </h3>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="calculation-dataset">Набор данных</Label>
                    <Select
                      open={datasetSelectOpen}
                      onOpenChange={setDatasetSelectOpen}
                      value={datasetId || "__example__"}
                      onValueChange={(value) => {
                        if (datasetSelectOpen)
                          setDatasetId(value === "__example__" ? "" : value);
                      }}
                    >
                      <SelectTrigger
                        id="calculation-dataset"
                        aria-label="Набор данных"
                      >
                        <SelectValue>
                          {selectedDataset
                            ? `${selectedDataset.name} · ${selectedDataset.pointCount} точек`
                            : "Встроенный пример Сочи (по умолчанию)"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__example__">
                          Встроенный пример Сочи (по умолчанию)
                        </SelectItem>
                        {datasets.map((dataset) => (
                          <SelectItem key={dataset.id} value={dataset.id}>
                            {dataset.name} · {dataset.pointCount} точек
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedDataset?.source ??
                      "Пример Сочи (OpenStreetMap, ODbL) сохранится в вашем аккаунте при запуске."}
                    {selectedDataset?.sourceRevision &&
                      ` · версия: ${selectedDataset.sourceRevision}`}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/35 p-4">
                    <div>
                      <p className="text-sm font-medium">Есть свой GeoJSON?</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Сохраните его как новый набор и используйте в этом
                        расчёте.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      aria-expanded={datasetUploadOpen}
                      onClick={() => setDatasetUploadOpen((open) => !open)}
                    >
                      <FilePlus2 aria-hidden="true" />
                      {datasetUploadOpen ? "Скрыть форму" : "Загрузить GeoJSON"}
                    </Button>
                  </div>
                </section>
              )}
            </>
          )}
        </form>

        {isDatasetCalculation && datasetUploadOpen && (
          <DatasetUpload
            onSaved={(dataset) => {
              setDatasets((current) => [dataset, ...current]);
              setDatasetId(dataset.id);
              setKind("dimension_dataset");
              setDatasetUploadOpen(false);
            }}
          />
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{scenario?.title ?? "Готовим сценарий…"}</span>
            {kind === "erosion" && scenario && (
              <span className="rounded-full bg-warning-background px-2 py-0.5 text-xs text-warning">
                Демо
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Можно иметь до 5 незавершённых расчётов одновременно.
          </p>
        </div>
        <Button
          type="submit"
          form="new-calculation-form"
          disabled={loading || busy || !kinds.length}
          className="sm:min-w-48"
        >
          {busy ? "Ставим в очередь…" : "Запустить расчёт"}
        </Button>
      </footer>
    </DialogContent>
  );
}
