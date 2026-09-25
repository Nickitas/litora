import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type {
  CalculationJobDto,
  CalculationKind,
  CalculationKindDto,
  CalculationStatus,
} from "@litora/contracts";
import { useAuth } from "@/features/auth";
import { api } from "@/shared/api/client";

const labels: Record<CalculationStatus, string> = {
  queued: "В очереди",
  running: "Выполняется",
  succeeded: "Готово",
  failed: "Ошибка",
  cancelled: "Отменён",
};
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
      const job = await api.createCalculation({
        kind,
        input: kind === "erosion" ? { steps } : {},
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
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">Личный кабинет · {name}</p>
        <h1 className="mt-2 text-3xl font-bold">Мои исследования</h1>
        <p className="mt-3 text-muted-foreground">
          Параметры, отчёты и история ваших расчётов береговой линии.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 p-4 text-destructive"
        >
          {error}
          <button
            className="ml-4 underline"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Повторить
          </button>
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border bg-background p-5"
        >
          <h2 className="text-xl font-semibold">Новый расчёт</h2>
          <label className="block text-sm">
            Сценарий
            <select
              className="mt-2 w-full rounded-lg border bg-background p-3"
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
                className="mt-2 w-full rounded-lg border bg-background p-3"
                type="number"
                min={1}
                max={48}
                required
                value={steps}
                onChange={(event) => setSteps(Number(event.target.value))}
              />
            </label>
          )}
          <button
            disabled={busy || !kinds.length}
            className="w-full rounded-lg bg-primary p-3 text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Подождите…" : "Запустить расчёт"}
          </button>
          <p className="text-xs text-muted-foreground">
            Используются поставляемые данные Чёрного моря. Результаты доступны
            только в вашем аккаунте.
          </p>
        </form>
        <section className="space-y-3" aria-label="История расчётов">
          <h2 className="text-xl font-semibold">История расчётов</h2>
          {loading ? (
            <p role="status">Загружаем историю…</p>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-muted-foreground">
              Пока нет расчётов. Выберите сценарий и запустите первый.
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className={`rounded-xl border p-4 ${selectedId === job.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      className="text-left font-medium underline-offset-4 hover:underline"
                      onClick={() => setSelectedId(job.id)}
                    >
                      {kinds.find((item) => item.kind === job.kind)?.title ??
                        job.kind}
                    </button>
                    <span
                      className="rounded-full bg-muted px-3 py-1 text-xs"
                      role="status"
                    >
                      {labels[job.status]}
                    </span>
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
          className="space-y-4 rounded-2xl border p-5"
          aria-label="Результат расчёта"
        >
          <h2 className="text-xl font-semibold">Результат расчёта</h2>
          {!selectedDetail ? (
            <p role="status">Загружаем результаты…</p>
          ) : (
            <>
              <p className="text-sm">
                {labels[selectedDetail.status]} · {selectedDetail.id}
              </p>
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
                <p className="rounded-lg bg-amber-500/10 p-3 text-sm">
                  Демонстрационный сценарий. Не является прогнозом годового
                  размыва или калиброванным научным отчётом.
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
