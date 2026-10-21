import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { geoMercator, geoPath } from "d3-geo";
import type {
  CoastlinePreviewDto,
  ScientificCatalogueEntryDto,
  ScientificInputDto,
  ScientificInputQuotaDto,
  ReusableScientificArtifactDto,
} from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { displayLines } from "../model/coastline-display";
import {
  coastlineContinuationUrl,
  regionSourceUrl,
} from "../model/coastline-continuation";
import {
  useCoastlineValidation,
  validationPassed,
} from "../model/use-coastline-validation";
import { CoastlineValidationPanel } from "./coastline-validation-panel";

function matches(
  input: ScientificInputDto,
  entry: ScientificCatalogueEntryDto
) {
  return (
    input.role === entry.role &&
    input.filename === entry.filename &&
    input.sizeBytes === entry.sizeBytes &&
    input.source === entry.source &&
    input.sourceRevision === entry.sourceRevision &&
    input.license === entry.license &&
    input.crs === entry.crs &&
    input.coordinateUnit === entry.coordinateUnit &&
    (input.status !== "ready" || input.sha256 === entry.sha256)
  );
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось загрузить данные";

function WholeSeaOverview({
  entry,
  sourceId,
}: {
  entry: ScientificCatalogueEntryDto;
  sourceId?: string;
}) {
  const [preview, setPreview] = useState<CoastlinePreviewDto | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void (
      sourceId ? api.scientificCoastline(sourceId) : api.blackSeaCoastline()
    )
      .then((result) => {
        if (result.sha256 !== entry.sha256)
          throw new Error("Контур не совпадает с паспортом источника");
        if (active) {
          setPreview(result);
          setError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPreview(null);
          setError(message(error));
        }
      });
    return () => {
      active = false;
    };
  }, [entry.sha256, sourceId, revision]);
  const drawing = useMemo(() => {
    if (!preview) return null;
    const lines = displayLines(preview.geojson);
    if (!lines.length) return null;
    const geometry = { type: "MultiLineString" as const, coordinates: lines };
    const projection = geoMercator().fitExtent(
      [
        [20, 20],
        [780, 360],
      ],
      geometry
    );
    return geoPath(projection)(geometry);
  }, [preview]);
  return (
    <div className="space-y-2">
      {error ? (
        <div role="alert" className="rounded-lg border p-4 text-sm">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Повторить обзор моря
          </Button>
        </div>
      ) : drawing ? (
        <svg
          role="img"
          aria-label="Обзор всего Чёрного моря: граница морского района MarineRegions"
          viewBox="0 0 800 380"
          className="w-full rounded-xl border bg-muted/35 text-primary"
        >
          <path
            d={drawing}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
          <text x="772" y="24" textAnchor="end" fill="currentColor">
            С ↑
          </text>
        </svg>
      ) : (
        <p
          role="status"
          className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground"
        >
          Загружаем обзор всего моря…
        </p>
      )}
    </div>
  );
}

function WholeSeaSource({
  entry,
  inputs,
  unavailable,
  busy,
  error,
  onSave,
}: {
  entry: ScientificCatalogueEntryDto;
  inputs: ScientificInputDto[];
  unavailable: string;
  busy: boolean;
  error: string;
  onSave: (entry: ScientificCatalogueEntryDto, name: string) => void;
}) {
  const saved = inputs.find((input) => matches(input, entry));
  const ready = saved?.status === "ready" ? saved : undefined;
  const [editedName, setEditedName] = useState<string | null>(null);
  const name = saved?.name ?? editedName ?? entry.name;
  const check = useCoastlineValidation(
    "scientific",
    ready?.id ?? "",
    ready?.validation
  );
  return (
    <Card className="space-y-4 p-5 shadow-none sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">{entry.name}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{entry.purpose}.</p>
      </div>
      <WholeSeaOverview
        key={ready?.id ?? entry.id}
        entry={entry}
        sourceId={ready?.id}
      />
      <p className="text-sm text-muted-foreground">
        {entry.source} · {entry.crs} ·{" "}
        {(entry.sizeBytes / 1024).toLocaleString("ru-RU", {
          maximumFractionDigits: 1,
        })}{" "}
        КиБ
      </p>
      <p className="text-xs break-words text-muted-foreground">
        Версия: {entry.sourceRevision}
      </p>
      <p className="text-xs break-all text-muted-foreground">
        SHA-256: {entry.sha256}
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          Оригинал MarineRegions
        </a>
        <a
          href={entry.licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          Лицензия {entry.license}
        </a>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {entry.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {ready ? (
        <>
          <p role="status" className="text-sm">
            Приватный исходник «{ready.name}» сохранён.
          </p>
          <CoastlineValidationPanel check={check} />
          {validationPassed(check.state) ? (
            <Button asChild>
              <Link to={regionSourceUrl(ready.id)}>Выделить участок</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Выбор области станет доступен после успешной проверки геометрии
              Go.
            </p>
          )}
        </>
      ) : (
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && !unavailable && name.trim()) onSave(entry, name);
          }}
        >
          <div className="max-w-lg space-y-2">
            <Label htmlFor="whole-sea-copy-name">
              Название полного исходника
            </Label>
            <Input
              id="whole-sea-copy-name"
              value={name}
              maxLength={100}
              required
              disabled={busy || Boolean(unavailable) || Boolean(saved)}
              onChange={(event) => setEditedName(event.target.value)}
            />
          </div>
          {unavailable && (
            <p role="status" className="text-sm text-muted-foreground">
              {unavailable}
            </p>
          )}
          {saved?.status === "uploading" && (
            <p role="status" className="text-sm text-muted-foreground">
              Сохранение уже начато. Обновите список или повторите попытку
              позже.
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || Boolean(unavailable) || !name.trim()}
          >
            {busy
              ? "Сохраняем исходник…"
              : saved
                ? "Повторить сохранение исходника"
                : "Сохранить полный исходник"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}

export function WholeSeaResearch() {
  const [entries, setEntries] = useState<ScientificCatalogueEntryDto[]>([]);
  const [inputs, setInputs] = useState<ScientificInputDto[]>([]);
  const [quota, setQuota] = useState<ScientificInputQuotaDto | null>(null);
  const [lines, setLines] = useState<ReusableScientificArtifactDto[]>([]);
  const [linesAvailable, setLinesAvailable] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [revision, setRevision] = useState(0);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([
      api.scientificCatalogue(),
      api.scientificInputs(),
      api.scientificInputQuota(),
      api.reusableScientificArtifacts(),
    ]).then(([catalogue, own, usage, artifacts]) => {
      if (!mounted) return;
      setEntries(catalogue.status === "fulfilled" ? catalogue.value : []);
      setInputs(own.status === "fulfilled" ? own.value : []);
      setQuota(
        usage.status === "fulfilled" && own.status === "fulfilled"
          ? usage.value
          : null
      );
      setLines(
        artifacts.status === "fulfilled"
          ? artifacts.value.filter(
              (item) =>
                item.jobKind === "coastline_region" &&
                item.role === "coastline_geojson"
            )
          : []
      );
      setLinesAvailable(artifacts.status === "fulfilled");
      setErrors(
        [catalogue, own, usage, artifacts].flatMap((result) =>
          result.status === "rejected" ? [message(result.reason)] : []
        )
      );
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [revision]);
  async function save(entry: ScientificCatalogueEntryDto, name: string) {
    if (locked.current || loading || !quota) return;
    locked.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await api.saveScientificCatalogue(entry.id, {
        name: name.trim(),
      });
      if (!active.current) return;
      setInputs((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      const usage = await api.scientificInputQuota().catch(() => null);
      if (active.current) setQuota(usage);
    } catch (error: unknown) {
      if (!active.current) return;
      setSaveError(message(error));
      try {
        const [own, usage] = await Promise.all([
          api.scientificInputs(),
          api.scientificInputQuota(),
        ]);
        if (active.current) {
          setInputs(own);
          setQuota(usage);
        }
      } catch {
        if (active.current) setQuota(null);
      }
    } finally {
      locked.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <section aria-labelledby="whole-sea-heading" className="space-y-4">
      <h2
        id="whole-sea-heading"
        tabIndex={-1}
        className="scroll-mt-24 text-xl font-semibold"
      >
        Всё Чёрное море
      </h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Начните с общего обзора, сохраните полный исходник и задайте область на
        карте. Отдельные линии выбранной области сохранятся приватно в
        результатах расчёта.
      </p>
      <p className="text-sm text-muted-foreground">
        Полный контур и выделенные линии хранятся приватно как научные файлы и
        результаты. Ограничения малых наборов 500 точек / 64 КиБ сохраняются.
      </p>
      {loading && (
        <p role="status">Загружаем научные источники и сохранённые участки…</p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border p-4 text-sm">
          {errors.map((text, index) => (
            <p key={`${index}:${text}`}>{text}</p>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading || saving}
        onClick={() => {
          setLoading(true);
          setRevision((value) => value + 1);
        }}
      >
        Обновить научные файлы
      </Button>
      {quota && (
        <p className="text-xs text-muted-foreground">
          Научные файлы: {quota.usedCount} из {quota.limitCount};{" "}
          {(quota.usedBytes / 1024 ** 2).toLocaleString("ru-RU", {
            maximumFractionDigits: 1,
          })}{" "}
          из {(quota.limitBytes / 1024 ** 2).toLocaleString("ru-RU")} МиБ. Это
          отдельная квота от малых наборов.
        </p>
      )}
      {!loading && !entries.length && !errors.length && (
        <p role="status" className="text-sm text-muted-foreground">
          Полный исходник сейчас отсутствует в каталоге.
        </p>
      )}
      {entries.map((entry) => (
        <WholeSeaSource
          key={entry.id}
          entry={entry}
          inputs={inputs}
          busy={saving}
          error={saveError}
          unavailable={
            loading
              ? "Дождитесь загрузки списка своих научных файлов."
              : !quota
                ? "Для сохранения обновите список научных файлов и квоту."
                : !inputs.some((item) => matches(item, entry)) &&
                    (quota.usedCount >= quota.limitCount ||
                      quota.usedBytes + entry.sizeBytes > quota.limitBytes)
                  ? "Достигнут лимит научных файлов или их объёма."
                  : ""
          }
          onSave={(entry, name) => void save(entry, name)}
        />
      ))}
      <div id="saved-region-lines" className="scroll-mt-24 space-y-3">
        <h3 className="text-lg font-semibold">
          Сохранённые линии выбранных областей · {lines.length}
        </h3>
        <p className="text-sm text-muted-foreground">
          Это самостоятельные линии исходного контура, без соединения островов и
          разрывов. Для границы морского района действуют ограничения его
          источника.
        </p>
        <p className="text-sm text-muted-foreground">
          Линии остаются в результатах области. При удалении её расчёта доступ к
          этим файлам будет удалён.
        </p>
        <p className="text-sm text-muted-foreground">
          Здесь показаны последние доступные линии. Другие области можно открыть
          в{" "}
          <Link
            to="/lab/calculations"
            className="text-primary underline underline-offset-4"
          >
            истории расчётов
          </Link>
          .
        </p>
        {!loading && linesAvailable && !lines.length && (
          <p className="text-sm text-muted-foreground">
            После успешного выделения области здесь появятся её линии.
          </p>
        )}
        <ul className="space-y-3">
          {lines.map((line) => (
            <li
              key={line.id}
              className="min-w-0 space-y-2 rounded-xl border bg-card p-4"
            >
              <p className="text-sm font-medium break-all">{line.filename}</p>
              <p className="text-xs break-all text-muted-foreground">
                SHA-256: {line.sha256}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/lab/calculations/${line.jobId}`}>
                    Открыть область
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link
                    to={coastlineContinuationUrl({
                      kind: "dimension_file",
                      artifactId: line.id,
                      sourceJobId: line.jobId,
                    })}
                  >
                    Размерность этой линии
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
