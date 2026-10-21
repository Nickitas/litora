import { useState, type FormEvent } from "react";
import { parseCreateDataset, smallDatasetLimits, type DatasetDto } from "@litora/contracts";
import { FileUp } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { suggestDatasetName } from "../model/dataset-name";

export function DatasetUpload({
  onSaved,
  existingNames,
  separated = true,
}: {
  onSaved: (dataset: DatasetDto) => void;
  existingNames: readonly string[];
  separated?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [sourceRevision, setSourceRevision] = useState("");
  const [license, setLicense] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const Heading = separated ? "h3" : "h2";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError("");
    try {
      if (!name.trim()) throw new Error("Укажите название набора");
      if (!file) throw new Error("Выберите файл GeoJSON");
      if (file.size > smallDatasetLimits.maxBytes)
        throw new Error("GeoJSON не должен превышать 64 КиБ");
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); }
      catch { throw new Error("Файл должен содержать корректный JSON"); }
      const input = parseCreateDataset({
        name: name.trim(),
        source,
        ...(sourceRevision.trim()
          ? { sourceRevision: sourceRevision.trim() }
          : {}),
        license,
        crs: "EPSG:4326" as const,
        coordinateUnit: "degrees" as const,
        geometry: parsed,
      });
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
    <section
      aria-labelledby="dataset-upload-heading"
      className={separated ? "border-t pt-6" : ""}
    >
      <div className="flex gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileUp aria-hidden="true" className="size-4" />
        </div>
        <div>
          <Heading id="dataset-upload-heading" className="font-semibold">
            Загрузить свой GeoJSON
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Нужен LineString в WGS84 / EPSG:4326: 2–500 точек, до 64 КиБ. После
            сохранения геометрию проверит Go отдельным заданием.
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
            disabled={pending}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setSource("");
              setSourceRevision("");
              setLicense("");
              if (selected)
                setName(
                  suggestDatasetName(
                    selected.name.replace(/\.(geojson|json)$/i, ""),
                    existingNames
                  )
                );
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
            disabled={!file || pending}
            maxLength={100}
            aria-describedby="dataset-name-hint"
          />
          <p id="dataset-name-hint" className="text-xs text-muted-foreground">
            Имя файла без расширения. При совпадении добавляем номер; название
            можно полностью заменить.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataset-source">Источник данных</Label>
          <Input
            id="dataset-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
            disabled={!file || pending}
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
            disabled={!file || pending}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataset-license">
            Лицензия или условия использования
          </Label>
          <Input
            id="dataset-license"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
            required
            disabled={!file || pending}
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
