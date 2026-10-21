import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DatasetDto } from "@litora/contracts";
import {
  coastlineExamples,
  findSavedExample,
  type CoastlineExample,
} from "@litora/generated-data";
import { Check, ChevronDown, ExternalLink, Plus, Search } from "lucide-react";
import { api } from "@/shared/api/client";
import { Badge } from "@/shared/shadcn/components/ui/badge";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/shadcn/components/ui/collapsible";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { DatasetUpload } from "./ui/dataset-upload";
import { DatasetPassport } from "./ui/dataset-passport";
import { CoastlineValidationSummary } from "./ui/coastline-validation-panel";
import { validationPending } from "./model/use-coastline-validation";
import { suggestDatasetName } from "./model/dataset-name";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Дата не указана"
    : date.toLocaleString("ru-RU");
}

function DatasetCard({ dataset }: { dataset: DatasetDto }) {
  return (
    <li>
      <Link
        to={`/lab/datasets/${dataset.id}`}
        aria-labelledby={`dataset-title-${dataset.id}`}
        className="group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <Card className="h-full min-w-0 p-5 shadow-none transition-colors group-hover:border-primary sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                id={`dataset-title-${dataset.id}`}
                className="text-lg font-semibold break-words group-hover:underline"
              >
                {dataset.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Добавлен {formatDate(dataset.createdAt)}
              </p>
            </div>
            <Badge variant="secondary">GeoJSON · LineString</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Вход для расчёта размерности своей береговой линии.
          </p>

          <DatasetPassport dataset={dataset} />
          <CoastlineValidationSummary value={dataset.validation} />
          <p className="mt-4 text-sm font-medium text-primary">
            Открыть набор →
          </p>
        </Card>
      </Link>
    </li>
  );
}

function ExampleCard({
  example,
  saved,
  suggestedName,
  disabled,
  pending,
  onSave,
}: {
  example: CoastlineExample;
  saved: DatasetDto | undefined;
  suggestedName: string;
  disabled: boolean;
  pending: boolean;
  onSave: (example: CoastlineExample, name: string) => void;
}) {
  const [editedName, setEditedName] = useState<string | null>(null);
  const name = saved?.name ?? editedName ?? suggestedName;
  const nameId = `example-name-${example.key}`;
  return (
    <li>
      <Card className="flex h-full min-w-0 flex-col gap-4 p-5 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-primary">Учебный контур</p>
            <h3 className="mt-1 text-base font-semibold">
              {example.dataset.name}
            </h3>
          </div>
          {saved && (
            <Badge variant="secondary">
              <Check aria-hidden="true" className="size-3" /> Сохранён
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{example.description}</p>
        <p className="text-xs text-muted-foreground">
          {example.dataset.geometry.coordinates.length} точек ·{" "}
          {example.dataset.crs} · ODbL
        </p>
        <p className="text-xs text-muted-foreground">
          Источник: © OpenStreetMap contributors
          {example.dataset.sourceRevision &&
            ` · ${example.dataset.sourceRevision}`}
        </p>
        <form
          className="mt-auto space-y-3 pt-1"
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onSave(example, name.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={nameId}>Название</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setEditedName(event.target.value)}
              required
              maxLength={100}
              disabled={Boolean(saved) || disabled || pending}
              aria-describedby={`${nameId}-hint`}
            />
            <p id={`${nameId}-hint`} className="text-xs text-muted-foreground">
              {saved
                ? "Название в ваших наборах."
                : "Можно полностью заменить перед сохранением."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              variant={saved ? "secondary" : "default"}
              disabled={Boolean(saved) || disabled || pending || !name.trim()}
            >
              {saved
                ? "Уже в моих наборах"
                : pending
                  ? "Сохраняем…"
                  : "Сохранить набор"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={example.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Исходные данные{" "}
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            </Button>
          </div>
        </form>
      </Card>
    </li>
  );
}

export function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [validationPollError, setValidationPollError] = useState("");
  const [exampleError, setExampleError] = useState("");
  const [savingExampleKey, setSavingExampleKey] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    void api
      .datasets()
      .then((result) => {
        if (!mounted) return;
        setDatasets(result);
        setError("");
      })
      .catch((nextError: unknown) => {
        if (mounted)
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Не удалось загрузить наборы данных"
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [revision]);

  const hasPendingValidation = datasets.some((dataset) => validationPending(dataset.validation));
  useEffect(() => {
    if (!hasPendingValidation) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.datasets();
        if (!active) return;
        setDatasets(next); setValidationPollError("");
        if (next.some((dataset) => validationPending(dataset.validation))) timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (active) setValidationPollError("Не удалось обновить результаты проверки. Сохранённые наборы остаются в списке.");
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => { active = false; clearTimeout(timer); };
  }, [hasPendingValidation, revision]);

  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const quotaReached = datasets.length >= 100 && !error;
  const visibleDatasets = normalizedSearch
    ? datasets.filter((dataset) =>
        `${dataset.name} ${dataset.source} ${dataset.sourceRevision ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(normalizedSearch)
      )
    : datasets;

  function onSaved(dataset: DatasetDto) {
    setDatasets((current) => [
      dataset,
      ...current.filter((item) => item.id !== dataset.id),
    ]);
    setSearch("");
    setCreating(false);
    setSavedMessage(
      `Набор «${dataset.name}» сохранён. Состояние проверки геометрии показано в карточке.`
    );
  }

  async function saveExample(example: CoastlineExample, name: string) {
    if (savingExampleKey || !name.trim() || findSavedExample(datasets, example))
      return;
    setSavingExampleKey(example.key);
    setExampleError("");
    try {
      const saved = await api.createDataset({
        ...example.dataset,
        name: name.trim(),
      });
      onSaved(saved);
    } catch (nextError) {
      setExampleError(
        nextError instanceof Error
          ? nextError.message
          : "Не удалось сохранить пример"
      );
    } finally {
      setSavingExampleKey(null);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Рабочие данные</p>
          <h1 className="mt-1 text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
            Наборы данных
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Ваши береговые линии для расчётов и исследований.
          </p>
        </div>
        <Button
          type="button"
          variant={creating ? "outline" : "default"}
          disabled={loading || quotaReached}
          aria-expanded={creating}
          aria-controls="dataset-creation"
          aria-describedby="dataset-limits"
          onClick={() => {
            setCreating((value) => !value);
            setSavedMessage("");
          }}
        >
          {!creating && <Plus aria-hidden="true" className="size-4" />}
          {creating ? "Скрыть форму" : "Добавить набор"}
        </Button>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-sm">
        <p id="dataset-limits" className="max-w-2xl text-muted-foreground">
          До 100 наборов GeoJSON LineString в WGS84 / EPSG:4326. В каждом —
          2–500 точек, файл не больше 64 КиБ.
        </p>
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to="/docs/reference/black-sea-source-catalogue.md">
            Где взять данные
          </Link>
        </Button>
      </div>

      {quotaReached && (
        <p role="status" className="rounded-lg border bg-muted/35 p-3 text-sm">
          Достигнут лимит 100 наборов. Удаление пока недоступно; существующие
          наборы можно выбирать в новом расчёте.
        </p>
      )}

      {validationPollError && <div role="alert" className="rounded-lg border p-3 text-sm">
        <p>{validationPollError}</p><Button type="button" variant="link" onClick={reload}>Обновить состояния</Button>
      </div>}
      {savedMessage && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
        >
          {savedMessage}
        </p>
      )}

      {creating && (
        <Card id="dataset-creation" className="p-5 shadow-none sm:p-6">
          <DatasetUpload
            onSaved={onSaved}
            existingNames={datasets.map((dataset) => dataset.name)}
            separated={false}
          />
        </Card>
      )}

      <section
        aria-labelledby="dataset-list-heading"
        aria-busy={loading}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dataset-list-heading" className="text-xl font-semibold">
            Сохранённые наборы
          </h2>
          {!loading && !error && (
            <span className="text-sm text-muted-foreground">
              {datasets.length} из 100 возможных
            </span>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-status-failed-background p-4 text-status-failed"
          >
            <p>{error}</p>
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
        {loading ? (
          <p
            role="status"
            className="rounded-xl border border-dashed p-6 text-muted-foreground"
          >
            Загружаем наборы данных…
          </p>
        ) : datasets.length === 0 && !error ? (
          <div className="rounded-xl border border-dashed bg-card p-6">
            <p className="font-medium">Пока нет сохранённых наборов</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Добавьте свой GeoJSON кнопкой «Добавить набор». После сохранения
              он появится здесь и в форме нового расчёта.
            </p>
          </div>
        ) : datasets.length > 0 ? (
          <>
            <div className="max-w-md space-y-2">
              <Label htmlFor="dataset-search">
                Поиск по названию и источнику
              </Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="dataset-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Название или источник"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Поиск только среди ваших сохранённых наборов.
              </p>
            </div>
            {visibleDatasets.length === 0 ? (
              <p
                role="status"
                className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
              >
                По этому запросу наборы не найдены. Попробуйте другое название
                или источник.
              </p>
            ) : (
              <ul className="grid gap-4 xl:grid-cols-2">
                {visibleDatasets.map((dataset) => (
                  <DatasetCard key={dataset.id} dataset={dataset} />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>

      <section aria-labelledby="dataset-examples-heading">
        <Collapsible className="rounded-xl border bg-card">
          <h2 id="dataset-examples-heading">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="group h-auto w-full justify-between gap-3 rounded-xl px-5 py-4 text-left text-base font-semibold whitespace-normal sm:px-6"
              >
                Примеры для старта
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
              </Button>
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="space-y-4 border-t p-5 sm:p-6">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Фрагменты береговой линии из OpenStreetMap. Это учебные данные, не
              геодезическая съёмка и не основание для инженерного заключения.
              Сохраняйте только нужные.
            </p>
            <ul className="grid gap-4 lg:grid-cols-3">
              {coastlineExamples.map((example) => (
                <ExampleCard
                  key={example.key}
                  example={example}
                  saved={findSavedExample(datasets, example)}
                  suggestedName={suggestDatasetName(
                    example.suggestedName,
                    datasets.map((dataset) => dataset.name)
                  )}
                  disabled={
                    loading ||
                    Boolean(error) ||
                    quotaReached ||
                    Boolean(savingExampleKey)
                  }
                  pending={savingExampleKey === example.key}
                  onSave={(value, name) => void saveExample(value, name)}
                />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
        {exampleError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {exampleError}
          </p>
        )}
      </section>
    </div>
  );
}
