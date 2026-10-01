import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type {
  CalculationJobDto,
  CalculationKind,
  CalculationKindDto,
  DatasetDto,
} from "@litora/contracts";
import { defaultCoastlineDataset } from "@litora/generated-data";
import { CalculationStatus } from "@/entities/calculation/ui/calculation-status";
import { useAuth } from "@/features/auth";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { fieldControlClass } from "@/shared/ui/field-styles";
import { DatasetUpload } from "./ui/dataset-upload";

const active = (job: CalculationJobDto) =>
  job.status === "queued" || job.status === "running";

export function AccountPage() {
  const auth = useAuth();
  if (auth.loading) return <p role="status">Проверяем сессию…</p>;
  if (!auth.isAuthenticated || !auth.user)
    return <Navigate to="/login" replace />;
  return <Workspace name={auth.user.name} key={auth.user.id} />;
}

function Workspace({ name }: { name: string }) {
  const [jobs, setJobs] = useState<CalculationJobDto[]>([]);
  const [kinds, setKinds] = useState<CalculationKindDto[]>([]);
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [kind, setKind] = useState<CalculationKind>("dimension");
  const [steps, setSteps] = useState(3);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<CalculationJobDto>();
  const selectedDetail = detail?.id === selectedId ? detail : undefined;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const fail = useCallback(
    (error: unknown) =>
      setError(
        error instanceof Error ? error.message : "Не удалось получить данные"
      ),
    []
  );

  useEffect(() => {
    let mounted = true;
    api
      .datasets()
      .then((result) => {
        if (mounted) setDatasets(result);
      })
      .catch((error) => {
        if (mounted) fail(error);
      });
    return () => {
      mounted = false;
    };
  }, [fail]);
  useEffect(() => {
    let mounted = true;
    api
      .calculationKinds()
      .then((result) => {
        if (mounted) setKinds(result);
      })
      .catch((error) => {
        if (mounted) fail(error);
      });
    return () => {
      mounted = false;
    };
  }, [fail]);
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api.calculations();
        if (mounted) {
          setJobs(result);
          setLoading(false);
        }
      } catch (error) {
        if (mounted) {
          fail(error);
          setLoading(false);
        }
      } finally {
        if (mounted) timer = setTimeout(poll, 4000);
      }
    }
    void poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [revision, fail]);
  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const jobId = selectedId;
    async function poll() {
      let delay = 4000;
      try {
        const result = await api.calculation(jobId);
        if (mounted) {
          setDetail(result);
          delay = active(result) ? 2000 : 600000;
        }
      } catch (error) {
        if (mounted) fail(error);
      } finally {
        if (mounted) timer = setTimeout(poll, delay);
      }
    }
    void poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [selectedId, revision, fail]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
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
      setSelectedId(job.id);
      setRevision((value) => value + 1);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.cancelCalculation(id);
      setRevision((value) => value + 1);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  const scenario = kinds.find((item) => item.kind === kind);
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">Личный кабинет · {name}</p>
        <h1 className="mt-2 text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
          Мои исследования
        </h1>
        <p className="mt-3 text-muted-foreground">
          Параметры, отчёты и история ваших расчётов береговой линии.
        </p>
      </header>
      <DatasetUpload
        onSaved={(dataset) => {
          setDatasets((current) => [dataset, ...current]);
          setDatasetId(dataset.id);
          setKind("dimension_dataset");
        }}
      />
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
        >
          {error}
          <Button
            variant="link"
            className="ml-2"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Повторить
          </Button>
        </div>
      )}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border bg-card p-5 text-card-foreground"
        >
          <h2 className="text-2xl font-semibold">Новый расчёт</h2>
          <label className="block text-sm">
            Сценарий
            <select
              className={fieldControlClass}
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as CalculationKind)
              }
            >
              {kinds.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            {scenario?.description}
          </p>
          {kind === "erosion" && (
            <label className="block text-sm">
              Шаги волнового ряда (1–48)
              <input
                className={fieldControlClass}
                type="number"
                min={1}
                max={48}
                required
                value={steps}
                onChange={(event) => setSteps(Number(event.target.value))}
              />
            </label>
          )}
          {kind === "dimension_dataset" && (
            <label className="block text-sm">
              Ваш набор данных
              <select
                value={datasetId}
                onChange={(event) => setDatasetId(event.target.value)}
                className={fieldControlClass}
              >
                <option value="">Пример GeoJSON Сочи (по умолчанию)</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} · {dataset.pointCount} точек
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs text-muted-foreground">
                {selectedDataset?.source ??
                  "При первом запуске пример сохранится в вашем аккаунте; для своей линии загрузите файл выше."}
                {selectedDataset?.sourceRevision &&
                  ` · версия: ${selectedDataset.sourceRevision}`}
              </span>
            </label>
          )}
          <Button disabled={busy || !kinds.length} className="w-full">
            {busy ? "Подождите…" : "Запустить расчёт"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {kind === "dimension_dataset"
              ? "Без выбранного набора используется пример Сочи (OpenStreetMap, ODbL). Go проверит геометрию при запуске."
              : "Используются поставляемые данные Чёрного моря. Результаты доступны только в вашем аккаунте."}
          </p>
        </form>
        <section className="min-w-0 space-y-3" aria-label="История расчётов">
          <h2 className="text-2xl font-semibold">История расчётов</h2>
          {loading ? (
            <p role="status">Загружаем историю…</p>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-8 text-muted-foreground">
              Пока нет расчётов. Выберите сценарий и запустите первый.
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className={`rounded-xl border bg-card p-4 text-card-foreground ${selectedId === job.id ? "border-primary bg-accent" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      className="text-left font-medium underline-offset-4 hover:underline"
                      onClick={() => setSelectedId(job.id)}
                    >
                      {kinds.find((item) => item.kind === job.kind)?.title ??
                        job.kind}
                    </button>
                    <CalculationStatus status={job.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString("ru-RU")} ·{" "}
                    {job.id.slice(0, 8)}
                  </p>
                  <div className="mt-3 flex gap-4 text-sm">
                    <button
                      className="text-primary underline"
                      onClick={() => setSelectedId(job.id)}
                    >
                      Результаты и параметры
                    </button>
                    {active(job) && (
                      <button
                        disabled={busy}
                        onClick={() => void cancel(job.id)}
                        className="text-destructive underline"
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {selectedId && (
        <section
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-5 text-card-foreground"
          aria-label="Результат расчёта"
        >
          <h2 className="text-2xl font-semibold">Результат расчёта</h2>
          {!selectedDetail ? (
            <p role="status">Загружаем результаты…</p>
          ) : (
            <>
              <div
                aria-live="polite"
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <CalculationStatus status={selectedDetail.status} />
                <code className="break-all text-muted-foreground">
                  {selectedDetail.id}
                </code>
              </div>
              {selectedDetail.errorMessage && (
                <p
                  role="alert"
                  className="text-sm whitespace-pre-wrap text-destructive"
                >
                  {selectedDetail.errorMessage}
                </p>
              )}
              {active(selectedDetail) && (
                <p role="status" className="text-muted-foreground">
                  Результаты появятся здесь автоматически после выполнения.
                </p>
              )}
              {selectedDetail.resultSummary?.scenario === "demo" && (
                <p className="rounded-lg bg-warning-background p-3 text-sm text-warning">
                  Демонстрационный сценарий. Не является прогнозом годового
                  размыва или калиброванным научным отчётом.
                </p>
              )}
              {selectedDetail.methodId && selectedDetail.methodRevision && (
                <p className="text-sm text-muted-foreground">
                  Метод расчёта: <code>{selectedDetail.methodId}</code>, ревизия{" "}
                  <code>{selectedDetail.methodRevision}</code>
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {selectedDetail.artifacts
                  .filter((file) => file.contentType.startsWith("image/"))
                  .map((file) => (
                    <figure
                      className="overflow-hidden rounded-xl border"
                      key={file.id}
                    >
                      <img
                        src={file.downloadUrl}
                        alt={file.filename}
                        loading="lazy"
                        className="max-h-96 w-full bg-white object-contain"
                      />
                      <figcaption className="p-3 text-sm">
                        {file.filename}
                      </figcaption>
                    </figure>
                  ))}
              </div>
              <ul className="space-y-2 text-sm">
                {selectedDetail.artifacts.map((file) => (
                  <li key={file.id}>
                    <a
                      className="text-primary underline"
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.filename}
                    </a>
                    <span className="ml-3 text-muted-foreground">
                      {(file.sizeBytes / 1024).toFixed(1)} КБ
                    </span>
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer">
                  Параметры и метрики JSON
                </summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">
                  {JSON.stringify(
                    {
                      input: selectedDetail.input,
                      result: selectedDetail.resultSummary,
                      coreVersion: selectedDetail.coreVersion,
                      methodId: selectedDetail.methodId,
                      methodRevision: selectedDetail.methodRevision,
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            </>
          )}
        </section>
      )}
    </div>
  );
}
