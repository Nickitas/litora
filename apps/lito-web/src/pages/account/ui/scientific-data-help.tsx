import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ScientificInputFormatDto, ScientificInputRole } from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import { scientificDataSources } from "../model/scientific-data-sources";
import { errorMessage } from "../model/use-calculations";

export function ScientificDataHelp({ role }: { role: ScientificInputRole }) {
  const [formats, setFormats] = useState<ScientificInputFormatDto[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void api.scientificInputFormats().then((value) => { if (active) { setFormats(value); setError(""); } })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [revision]);
  const format = formats?.find((entry) => entry.role === role);
  const resources = scientificDataSources.filter((entry) => entry.roles.includes(role));
  function downloadSchema() {
    if (!format) return;
    const body = format.schema ?? { schemaVersion: format.schemaVersion, role: format.role, format: format.format, columns: format.columns, description: format.description };
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${role}-v${format.schemaVersion}.${format.schema ? "schema" : "format"}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <aside aria-label="Формат и источники научных данных" className="space-y-3 rounded-xl border bg-muted/25 p-3 text-sm">
    <p className="font-medium">Строгий формат входного файла</p>
    {format ? <>
      <p className="text-muted-foreground">Версия {format.schemaVersion} · {format.format.toUpperCase()} · до {Math.min(512, format.maxBytes / 1024 / 1024)} МиБ. {format.description}</p>
      <Button type="button" variant="outline" onClick={downloadSchema}>{format.schema ? "Скачать схему этого формата" : "Скачать описание этого формата"}</Button>
    </> : error ? <p role="alert" className="text-destructive">Схема недоступна: {error} <Button type="button" variant="link" onClick={() => setRevision((v) => v + 1)}>Повторить</Button></p>
      : <p role="status" className="text-muted-foreground">Загружаем схему формата…</p>}
    <p className="text-muted-foreground">Не меняйте порядок осей, единицы и названия полей. Проверка покрытия, совместимости файлов и научных критериев выполняется дополнительно при расчёте.</p>
    {resources.length > 0 && <div className="space-y-2"><p className="font-medium">Где взять исходные данные</p><ul className="space-y-3">{resources.map((entry) => <li key={entry.href}>
      <a href={entry.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2">{entry.title}<span className="sr-only"> (в новой вкладке)</span></a>
      <p className="text-muted-foreground">{entry.note}</p>
    </li>)}</ul></div>}
    <Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" to="/docs/reference/black-sea-regions-and-data.md">Форматы, примеры и подготовка данных<span className="sr-only"> (в новой вкладке)</span></Link>
  </aside>;
}
