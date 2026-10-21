import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { smallDatasetLimits, type DatasetDto } from "@litora/contracts";
import {
  findSavedResearchDataset,
  type ResearchCatalogueEntry,
} from "@litora/generated-data/research";
import { Plus, Search } from "lucide-react";
import { api } from "@/shared/api/client";
import { Badge } from "@/shared/shadcn/components/ui/badge";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { DatasetUpload } from "./ui/dataset-upload";
import { DatasetPassport } from "./ui/dataset-passport";
import { CoastlineValidationSummary } from "./ui/coastline-validation-panel";
import { validationPending } from "./model/use-coastline-validation";
import { ResearchCatalogue } from "./ui/research-catalogue";
import { loadResearchDataset } from "./model/research-catalogue";
import { WholeSeaResearch } from "./ui/whole-sea-research";

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

export function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [validationPollError, setValidationPollError] = useState("");
  const [catalogueError, setCatalogueError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [savingCatalogueId, setSavingCatalogueId] = useState<string | null>(
    null
  );
  const savingCatalogue = useRef(false);
  const active = useRef(true);
  const listVersion = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    const version = listVersion.current;
    void api
      .datasets()
      .then((result) => {
        if (!mounted || version !== listVersion.current) return;
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

  const hasPendingValidation = datasets.some((dataset) =>
    validationPending(dataset.validation)
  );
  useEffect(() => {
    if (!hasPendingValidation) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const version = listVersion.current;
        const next = await api.datasets();
        if (!active) return;
        if (version !== listVersion.current) {
          timer = setTimeout(() => void poll(), 2000);
          return;
        }
        setDatasets(next);
        setValidationPollError("");
        if (next.some((dataset) => validationPending(dataset.validation)))
          timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (active)
          setValidationPollError(
            "Не удалось обновить результаты проверки. Сохранённые наборы остаются в списке."
          );
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [hasPendingValidation, revision]);

  const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
  const quotaReached =
    datasets.length >= smallDatasetLimits.maxPerUser && !error;
  const visibleDatasets = normalizedSearch
    ? datasets.filter((dataset) =>
        `${dataset.name} ${dataset.source} ${dataset.sourceRevision ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(normalizedSearch)
      )
    : datasets;

  function onSaved(dataset: DatasetDto) {
    listVersion.current += 1;
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

  async function saveCatalogueEntry(
    entry: ResearchCatalogueEntry,
    name: string
  ) {
    if (
      savingCatalogue.current ||
      loading ||
      error ||
      quotaReached ||
      !name.trim() ||
      findSavedResearchDataset(datasets, entry)
    )
      return;
    savingCatalogue.current = true;
    setSavingCatalogueId(entry.id);
    setCatalogueError(null);
    try {
      const fresh = await api.datasets();
      if (!active.current) return;
      setDatasets(fresh);
      const existing = findSavedResearchDataset(fresh, entry);
      if (existing) {
        onSaved(existing);
        return;
      }
      if (fresh.length >= smallDatasetLimits.maxPerUser)
        throw new Error("Достигнут лимит 100 сохранённых наборов данных");
      const prepared = await loadResearchDataset(entry);
      if (!active.current) return;
      const saved = await api.createDataset({ ...prepared, name: name.trim() });
      if (active.current) onSaved(saved);
    } catch (nextError: unknown) {
      if (!active.current) return;
      try {
        const fresh = await api.datasets();
        if (!active.current) return;
        setDatasets(fresh);
        const existing = findSavedResearchDataset(fresh, entry);
        if (existing) {
          onSaved(existing);
          return;
        }
      } catch {
        if (active.current)
          setError(
            "Не удалось обновить список наборов. Повторите загрузку перед сохранением."
          );
      }
      if (active.current)
        setCatalogueError({
          id: entry.id,
          message:
            nextError instanceof Error
              ? nextError.message
              : "Не удалось сохранить набор из каталога",
        });
    } finally {
      savingCatalogue.current = false;
      if (active.current) setSavingCatalogueId(null);
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
          disabled={
            loading ||
            Boolean(error) ||
            quotaReached ||
            Boolean(savingCatalogueId)
          }
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

      <div className="flex flex-wrap gap-3 text-sm">
        <Button asChild variant="outline" size="sm">
          <a href="#research-catalogue-heading">Готовые участки: 24</a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="#whole-sea-heading">Всё Чёрное море</a>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-sm">
        <p id="dataset-limits" className="max-w-2xl text-muted-foreground">
          До 100 наборов GeoJSON LineString в WGS84 / EPSG:4326. В каждом —
          2–500 точек, файл не больше 64 КиБ.
        </p>
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to="/docs/reference/black-sea-source-catalogue.md">
            Источники и ограничения
          </Link>
        </Button>
      </div>

      {quotaReached && (
        <p role="status" className="rounded-lg border bg-muted/35 p-3 text-sm">
          Достигнут лимит 100 наборов. Удаление пока недоступно; существующие
          наборы можно выбирать в новом расчёте.
        </p>
      )}

      {validationPollError && (
        <div role="alert" className="rounded-lg border p-3 text-sm">
          <p>{validationPollError}</p>
          <Button type="button" variant="link" onClick={reload}>
            Обновить состояния
          </Button>
        </div>
      )}
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
              Выберите участок в каталоге ниже или добавьте свой GeoJSON кнопкой
              «Добавить набор». После сохранения он появится здесь и в форме
              нового расчёта.
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

      <WholeSeaResearch />

      <ResearchCatalogue
        datasets={datasets}
        disabled={loading || Boolean(error) || quotaReached}
        unavailableMessage={
          loading
            ? "Сохранение станет доступно после загрузки ваших наборов."
            : error
              ? "Для сохранения повторите загрузку списка своих наборов выше."
              : quotaReached
                ? "Квота 100 наборов исчерпана. Уже сохранённые участки можно открыть."
                : ""
        }
        pendingId={savingCatalogueId}
        error={catalogueError}
        onSave={(entry, name) => void saveCatalogueEntry(entry, name)}
      />
    </div>
  );
}
