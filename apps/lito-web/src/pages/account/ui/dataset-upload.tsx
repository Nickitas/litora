import { useState, type FormEvent } from "react";
import type { DatasetDto, GeoJsonLineStringDto } from "@litora/contracts";
import { FileUp } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";

export function DatasetUpload({
  onSaved,
}: {
  onSaved: (dataset: DatasetDto) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [sourceRevision, setSourceRevision] = useState("");
  const [license, setLicense] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError("");
    try {
      if (!file) throw new Error("Выберите файл GeoJSON");
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
      const input = {
        name,
        source,
        ...(sourceRevision.trim()
          ? { sourceRevision: sourceRevision.trim() }
          : {}),
        license,
        crs: "EPSG:4326" as const,
        coordinateUnit: "degrees" as const,
        geometry: parsed as GeoJsonLineStringDto,
      };
      const dataset = await api.createDataset(input);
      onSaved(dataset);
      setFile(null);
      setName("");
      setSource("");
      setSourceRevision("");
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
    <section aria-labelledby="dataset-upload-heading" className="border-t pt-6">
      <div className="flex gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileUp aria-hidden="true" className="size-4" />
        </div>
        <div>
          <h3 id="dataset-upload-heading" className="font-semibold">
            Загрузить свой GeoJSON
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Нужен LineString в WGS84 / EPSG:4326: 2–500 точек, до 64 КиБ. На
            запуске геометрию дополнительно проверит Go.
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-5 grid gap-4 md:grid-cols-2"
        aria-busy={pending}
      >
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="dataset-file">Файл GeoJSON</Label>
          <Input
            id="dataset-file"
            type="file"
            accept=".geojson,application/geo+json,application/json"
            required
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setSource("");
              setSourceRevision("");
              setLicense("");
              if (selected)
                setName(selected.name.replace(/\.geojson$/i, "").slice(0, 100));
              else setName("");
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataset-name">Название</Label>
          <Input
            id="dataset-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={!file}
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataset-source">Источник данных</Label>
          <Input
            id="dataset-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
            disabled={!file}
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataset-source-revision">
            Версия источника или дата снимка (необязательно)
          </Label>
          <Input
            id="dataset-source-revision"
            value={sourceRevision}
            onChange={(event) => setSourceRevision(event.target.value)}
            disabled={!file}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataset-license">Лицензия или условия использования</Label>
          <Input
            id="dataset-license"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
            required
            disabled={!file}
            maxLength={100}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive md:col-span-2">
            {error}
          </p>
        )}
        <Button disabled={pending || !file} className="md:col-span-2">
          {pending ? "Сохраняем набор…" : "Сохранить набор"}
        </Button>
      </form>
    </section>
  );
}
