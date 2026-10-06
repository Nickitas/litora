import { useState, type FormEvent } from "react";
import type { ScientificInputDto, ScientificInputRole } from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";
import { errorMessage } from "../model/use-calculations";
import { scientificRoleLabels } from "../model/scientific-role-labels";

export function ScientificInputUpload({
  role,
  existing,
  onSaved,
  onPending,
  onCancel,
}: {
  role: ScientificInputRole;
  existing?: ScientificInputDto;
  onSaved: (value: ScientificInputDto) => void;
  onPending?: (value: ScientificInputDto) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [source, setSource] = useState(existing?.source ?? "");
  const [sourceRevision, setSourceRevision] = useState(existing?.sourceRevision ?? "");
  const [license, setLicense] = useState(existing?.license ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(existing?.id ?? null);
  const crs = role === "coastline_geojson" || role === "bathymetry_grid_json"
    ? "EPSG:4326" : role === "seabed_msh" || role === "flat_mesh_msh" ? "LAEA" : "not-applicable";
  const coordinateUnit = role === "coastline_geojson" || role === "bathymetry_grid_json"
    ? "degrees" : role === "seabed_msh" || role === "flat_mesh_msh" ? "meters" : "not-applicable";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    if (file.size < 1 || file.size > 512 * 1024 * 1024) {
      setError("Размер файла должен быть от 1 байта до 512 МиБ.");
      return;
    }
    if (existing && (file.name !== existing.filename || file.size !== existing.sizeBytes)) {
      setError("Для продолжения выберите тот же файл с исходным именем и размером.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let id = pendingId;
      if (!id) {
        const pending = await api.createScientificInput({
          name, role, filename: file.name, sizeBytes: file.size,
          source, ...(sourceRevision.trim() ? { sourceRevision } : {}),
          license, crs, coordinateUnit,
        });
        id = pending.id;
        setPendingId(id);
        onPending?.(pending);
      }
      const ready = await api.uploadScientificInput(id, file);
      onSaved(ready);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border bg-card p-4" aria-busy={busy}>
      <div>
        <h4 className="font-semibold">Загрузить: {scientificRoleLabels[role]}</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {existing
            ? `Продолжение загрузки: ${existing.filename} · ${existing.sizeBytes} байт. Выберите исходный файл снова.`
            : "Файл остаётся приватным. Источник и лицензию указываете вы; научную совместимость проверит Go при расчёте."}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="scientific-file">Файл (до 512 МиБ)</Label>
        <Input id="scientific-file" type="file" required disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            if (selected && !existing) setName(selected.name);
            if (!existing) setPendingId(null);
          }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="scientific-name">Название</Label>
          <Input id="scientific-name" value={name} maxLength={100} required disabled={busy || Boolean(existing)}
            onChange={(event) => { setName(event.target.value); setPendingId(null); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scientific-source">Источник данных</Label>
          <Input id="scientific-source" value={source} maxLength={200} required disabled={busy || Boolean(existing)}
            onChange={(event) => { setSource(event.target.value); setPendingId(null); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scientific-revision">Версия источника (если есть)</Label>
          <Input id="scientific-revision" value={sourceRevision} maxLength={120} disabled={busy || Boolean(existing)}
            onChange={(event) => { setSourceRevision(event.target.value); setPendingId(null); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scientific-license">Лицензия</Label>
          <Input id="scientific-license" value={license} maxLength={100} required disabled={busy || Boolean(existing)}
            onChange={(event) => { setLicense(event.target.value); setPendingId(null); }} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">CRS: {crs} · единицы: {coordinateUnit}. SHA-256 вычислит сервер.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!file || busy}>
          {busy ? "Передаём и проверяем файл…" : pendingId ? "Повторить передачу файла" : "Сохранить приватный файл"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Отмена</Button>
      </div>
    </form>
  );
}
