import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { geoMercator, geoPath } from "d3-geo";
import type { CreateDatasetDto, DatasetDto } from "@litora/contracts";
import {
  findSavedResearchDataset,
  researchCatalogue,
  type ResearchCatalogueEntry,
} from "@litora/generated-data/research";
import { Check, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/shared/shadcn/components/ui/badge";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { suggestDatasetName } from "../model/dataset-name";
import { loadResearchDataset } from "../model/research-catalogue";

function ResearchCard({
  entry,
  saved,
  name,
  disabled,
  pending,
  saveError,
  onName,
  onSave,
}: {
  entry: ResearchCatalogueEntry;
  saved: DatasetDto | undefined;
  name: string;
  disabled: boolean;
  pending: boolean;
  saveError: string;
  onName: (value: string) => void;
  onSave: (entry: ResearchCatalogueEntry, name: string) => void;
}) {
  const [dataset, setDataset] = useState<CreateDatasetDto | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void loadResearchDataset(entry)
      .then((result) => {
        if (active) {
          setDataset(result);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить контур. Повторите попытку.");
      });
    return () => {
      active = false;
    };
  }, [entry, revision]);

  const projection = dataset
    ? geoMercator().fitExtent(
        [
          [16, 16],
          [304, 144],
        ],
        dataset.geometry
      )
    : null;
  const path =
    dataset && projection ? geoPath(projection)(dataset.geometry) : null;
  return (
    <li>
      <Card className="h-full min-w-0 gap-0 overflow-hidden py-0 shadow-none">
        <div className="border-b bg-muted/35" aria-busy={!dataset && !error}>
          {error ? (
            <div
              role="alert"
              className="flex min-h-40 flex-col items-start justify-center gap-2 p-4 text-sm"
            >
              <p>{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setError("");
                  setRevision((value) => value + 1);
                }}
              >
                Повторить загрузку контура
              </Button>
            </div>
          ) : path ? (
            <svg
              viewBox="0 0 320 160"
              role="img"
              aria-label={`Превью фрагмента: ${entry.name}`}
              className="h-40 w-full text-primary"
            >
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x="306"
                y="22"
                textAnchor="end"
                fill="currentColor"
                className="text-xs"
              >
                С ↑
              </text>
            </svg>
          ) : (
            <p
              role="status"
              className="flex h-40 items-center justify-center text-sm text-muted-foreground"
            >
              Загружаем превью…
            </p>
          )}
        </div>
        <div className="flex grow flex-col gap-4 p-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Картографический фрагмент</Badge>
              {saved && (
                <Badge variant="outline">
                  <Check aria-hidden="true" className="size-3" /> Сохранён
                </Badge>
              )}
            </div>
            <h3 className="mt-3 text-lg font-semibold break-words">
              {entry.name}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {entry.purpose}.
            </p>
            <p className="mt-2 text-sm">
              {entry.pointCount} точек · WGS84 / EPSG:4326
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Один фрагмент района. Точность положения не подтверждена.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <a
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Оригинал в OSM{" "}
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
              <a
                className="text-primary underline underline-offset-4"
                href={entry.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {entry.dataset.license}
              </a>
            </div>
            <a
              className="inline-block text-muted-foreground underline underline-offset-4"
              href={entry.attributionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              © OpenStreetMap contributors
            </a>
            <details>
              <summary className="cursor-pointer rounded-sm text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Паспорт и ограничения
              </summary>
              <div className="mt-2 space-y-2 break-words text-muted-foreground">
                <p>{entry.dataset.source}</p>
                <p>Версия: {entry.dataset.sourceRevision}</p>
                <p>
                  Дата среза OSM: {entry.sourceDate.slice(0, 10)}. Это дата
                  базы, а не съёмки берега.
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  {entry.limitations.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
          <form
            className="mt-auto space-y-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && !pending && !saved && dataset && name.trim())
                onSave(entry, name);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`catalogue-name-${entry.id}`}>
                Название своей копии
              </Label>
              <Input
                id={`catalogue-name-${entry.id}`}
                value={saved?.name ?? name}
                required
                maxLength={100}
                disabled={Boolean(saved) || disabled || pending}
                onChange={(event) => onName(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                variant={saved ? "secondary" : "default"}
                disabled={
                  Boolean(saved) ||
                  disabled ||
                  pending ||
                  !dataset ||
                  !name.trim()
                }
              >
                {saved
                  ? "Уже в моих наборах"
                  : pending
                    ? "Сохраняем…"
                    : "Сохранить набор"}
              </Button>
              {saved && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/lab/datasets/${saved.id}`}>Открыть набор</Link>
                </Button>
              )}
            </div>
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            )}
          </form>
        </div>
      </Card>
    </li>
  );
}

export function ResearchCatalogue({
  datasets,
  disabled,
  unavailableMessage,
  pendingId,
  error,
  onSave,
}: {
  datasets: DatasetDto[];
  disabled: boolean;
  unavailableMessage: string;
  pendingId: string | null;
  error: { id: string; message: string } | null;
  onSave: (entry: ResearchCatalogueEntry, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const visible = researchCatalogue.filter((entry) =>
    `${entry.name} ${entry.dataset.source}`
      .toLocaleLowerCase("ru-RU")
      .includes(query)
  );
  return (
    <section aria-labelledby="research-catalogue-heading" className="space-y-4">
      <div>
        <h2
          id="research-catalogue-heading"
          tabIndex={-1}
          className="scroll-mt-24 text-xl font-semibold"
        >
          Каталог готовых данных
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          24 подготовленных фрагмента побережья Чёрного моря для исследования
          геометрии и размерности. Сохраните нужный под своим именем и откройте
          его для проверки и расчёта.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Контуры не содержат временного ряда для прогноза. До сохранения они не
          занимают место в ваших наборах.
        </p>
      </div>
      <div className="max-w-md space-y-2">
        <Label htmlFor="catalogue-search">Поиск участка в каталоге</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="catalogue-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Например, Сочи или Синоп"
          />
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          Показано {visible.length} из {researchCatalogue.length}
        </p>
      </div>
      {unavailableMessage && (
        <p
          role="status"
          className="rounded-lg border bg-muted/35 p-3 text-sm text-muted-foreground"
        >
          {unavailableMessage}
        </p>
      )}
      {visible.length ? (
        <ul className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((entry) => (
            <ResearchCard
              key={entry.id}
              entry={entry}
              saved={findSavedResearchDataset(datasets, entry)}
              name={
                names[entry.id] ??
                suggestDatasetName(
                  entry.name,
                  datasets.map((dataset) => dataset.name)
                )
              }
              disabled={disabled || Boolean(pendingId)}
              pending={pendingId === entry.id}
              saveError={error?.id === entry.id ? error.message : ""}
              onName={(value) =>
                setNames((current) => ({ ...current, [entry.id]: value }))
              }
              onSave={onSave}
            />
          ))}
        </ul>
      ) : (
        <p
          role="status"
          className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
        >
          Участки не найдены. Измените название или очистите поиск.
        </p>
      )}
    </section>
  );
}
