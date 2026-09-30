import { useState, type FormEvent } from "react";
import type { DatasetDto, GeoJsonLineStringDto } from "@litora/contracts";
import { defaultCoastlineDataset } from "@litora/generated-data";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { fieldControlClass } from "@/shared/ui/field-styles";

export function DatasetUpload({
  onSaved,
}: {
  onSaved: (dataset: DatasetDto) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError("");
    try {
      let input = defaultCoastlineDataset;
      if (file) {
        if (file.size > 65_536)
          throw new Error("GeoJSON не должен превышать 64 КиБ");
        const parsed: unknown = JSON.parse(await file.text());
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          (parsed as { type?: unknown }).type !== "LineString"
        )
          throw new Error(
            "Выберите GeoJSON LineString с координатами [долгота, широта]"
          );
        input = {
          name,
          source,
          license,
          crs: "EPSG:4326",
          coordinateUnit: "degrees",
          geometry: parsed as GeoJsonLineStringDto,
        };
      }
      const dataset = await api.createDataset(input);
      onSaved(dataset);
      setFile(null);
      setName("");
      setSource("");
      setLicense("");
      form.reset();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось загрузить набор"
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border bg-card p-5 text-card-foreground"
      aria-label="Загрузка береговой линии"
    >
      <h2 className="text-2xl font-semibold">Своя береговая линия</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Если файл не выбран, будет использован демонстрационный GeoJSON участка
        Сочи из OpenStreetMap (ODbL). Для своего файла нужен LineString: WGS84 /
        EPSG:4326, пары [долгота, широта] в градусах, 2–500 точек, до 64 КиБ.
        Геометрию проверит Go при расчёте.
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-4 grid gap-4 md:grid-cols-2"
        aria-busy={pending}
      >
        <label className="text-sm">
          Файл GeoJSON (необязательно)
          <input
            type="file"
            accept=".geojson,application/geo+json,application/json"
            className={fieldControlClass}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setSource("");
              setLicense("");
              if (selected)
                setName(selected.name.replace(/\.geojson$/i, "").slice(0, 100));
              else setName("");
            }}
          />
        </label>
        {file ? (
          <>
            <label className="text-sm">
              Название
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                className={fieldControlClass}
              />
            </label>
            <label className="text-sm">
              Источник данных
              <input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                required
                maxLength={200}
                className={fieldControlClass}
              />
            </label>
            <label className="text-sm">
              Лицензия или условия использования
              <input
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                required
                maxLength={100}
                className={fieldControlClass}
              />
            </label>
          </>
        ) : (
          <p className="text-sm text-muted-foreground md:col-span-2">
            По умолчанию: {defaultCoastlineDataset.name} ·{" "}
            {defaultCoastlineDataset.source}
            {" · "}
            {defaultCoastlineDataset.license}. Пример не заменяет съёмку.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive md:col-span-2">
            {error}
          </p>
        )}
        <Button disabled={pending} className="md:col-span-2">
          {pending
            ? "Сохраняем набор…"
            : file
              ? "Загрузить набор"
              : "Использовать пример GeoJSON"}
        </Button>
      </form>
    </section>
  );
}
