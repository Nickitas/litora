import { useCallback, useEffect, useState } from "react";
import type { DatasetDto } from "@litora/contracts";
import {
  coastlineExamples,
  findSavedExample,
  type CoastlineExample,
} from "@litora/generated-data";
import { Check, Database, ExternalLink, Plus, Search } from "lucide-react";
import { api } from "@/shared/api/client";
import { Badge } from "@/shared/shadcn/components/ui/badge";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { DatasetUpload } from "./ui/dataset-upload";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Дата не указана"
    : date.toLocaleString("ru-RU");
}

function DatasetCard({ dataset }: { dataset: DatasetDto }) {
  return (
    <li>
      <Card className="h-full min-w-0 p-5 shadow-none sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold break-words">
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

        <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Источник (заявлен)</dt>
            <dd className="mt-1 font-medium break-words">{dataset.source}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Версия или дата источника</dt>
            <dd className="mt-1 font-medium break-words">
              {dataset.sourceRevision || "Не указана"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Лицензия (заявлена)</dt>
            <dd className="mt-1 font-medium break-words">{dataset.license}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">
              Система координат и единицы
            </dt>
            <dd className="mt-1 font-medium">
              {dataset.crs} ·{" "}
              {dataset.coordinateUnit === "degrees"
                ? "градусы"
                : dataset.coordinateUnit}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Точки</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {new Intl.NumberFormat("ru-RU").format(dataset.pointCount)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Размер</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {new Intl.NumberFormat("ru-RU").format(dataset.sizeBytes)} байт
            </dd>
          </div>
        </dl>
        <div className="mt-5 border-t pt-4 text-sm">
          <p className="text-muted-foreground">Контрольная сумма SHA-256</p>
          <code className="mt-1 block text-xs leading-5 break-all">
            {dataset.sha256}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            Версия схемы набора: {dataset.schemaVersion}
          </p>
          <p className="mt-1 text-xs break-all text-muted-foreground">
            ID записи: {dataset.id}
          </p>
        </div>
      </Card>
    </li>
  );
}

function ExampleCard({
  example,
  saved,
  disabled,
  pending,
  onSave,
}: {
  example: CoastlineExample;
  saved: boolean;
  disabled: boolean;
  pending: boolean;
  onSave: (example: CoastlineExample) => void;
}) {
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
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant={saved ? "secondary" : "default"}
            disabled={saved || disabled || pending}
            onClick={() => onSave(example)}
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
      `Набор «${dataset.name}» сохранён. Он доступен в форме нового расчёта.`
    );
  }

  async function saveExample(example: CoastlineExample) {
    if (savingExampleKey || findSavedExample(datasets, example)) return;
    setSavingExampleKey(example.key);
    setExampleError("");
    try {
      const saved = await api.createDataset(example.dataset);
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
            Здесь хранится береговые линии для расчетов.
          </p>
        </div>
        <Button
          type="button"
          variant={creating ? "outline" : "default"}
          disabled={loading || quotaReached}
          aria-expanded={creating}
          aria-controls="dataset-creation"
          onClick={() => {
            setCreating((value) => !value);
            setSavedMessage("");
          }}
        >
          {!creating && <Plus aria-hidden="true" className="size-4" />}
          {creating ? "Скрыть форму" : "Добавить набор"}
        </Button>
      </header>

      {quotaReached && (
        <p role="status" className="rounded-lg border bg-muted/35 p-3 text-sm">
          Достигнут лимит 100 наборов. Удаление пока недоступно; существующие
          наборы можно выбирать в новом расчёте.
        </p>
      )}

      <div className="flex gap-3 rounded-xl border bg-muted/35 p-4 text-sm">
        <Database
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-primary"
        />
        <p>
          До 100 наборов GeoJSON LineString, каждый не больше 64 КиБ. Источник,
          версия и лицензия указаны вами. API проверяет структуру при
          сохранении, Go — расчётную пригодность при запуске.
        </p>
      </div>

      <section aria-labelledby="dataset-examples-heading" className="space-y-4">
        <div>
          <h2 id="dataset-examples-heading" className="text-xl font-semibold">
            Примеры для старта
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Три разных фрагмента береговой линии из OpenStreetMap. Сохраняйте
            только нужные: это учебные данные, не геодезическая съёмка и не
            основание для инженерного заключения.
          </p>
        </div>
        <ul className="grid gap-4 lg:grid-cols-3">
          {coastlineExamples.map((example) => (
            <ExampleCard
              key={example.key}
              example={example}
              saved={Boolean(findSavedExample(datasets, example))}
              disabled={
                loading ||
                Boolean(error) ||
                quotaReached ||
                Boolean(savingExampleKey)
              }
              pending={savingExampleKey === example.key}
              onSave={(value) => void saveExample(value)}
            />
          ))}
        </ul>
        {exampleError && (
          <p role="alert" className="text-sm text-destructive">
            {exampleError}
          </p>
        )}
      </section>

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
          <DatasetUpload onSaved={onSaved} separated={false} />
        </Card>
      )}

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

      <section aria-labelledby="dataset-list-heading" className="space-y-4">
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
              Сохраните учебный пример выше или добавьте свой GeoJSON
              LineString. Создание набора не запускает расчёт.
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
    </div>
  );
}
