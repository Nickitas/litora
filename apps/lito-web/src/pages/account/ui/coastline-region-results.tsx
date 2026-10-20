import { Link } from "react-router-dom";
import type { CalculationJobDto, CalculationKindDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import { coastlineContinuationUrl } from "../model/coastline-continuation";

export function CoastlineRegionResults({ job, kinds }: { job: CalculationJobDto; kinds: CalculationKindDto[] }) {
  if (job.kind !== "coastline_region" || job.status !== "succeeded" || job.deletionRequestedAt) return null;
  const lines = job.artifacts.filter((file) => file.category === "output" && /^region\/segments\/segment-\d{3}\.geojson$/.test(file.filename));
  return <section aria-labelledby="region-lines-heading" className="space-y-4 rounded-2xl border bg-card p-5">
    <h2 id="region-lines-heading" className="text-xl font-semibold">Выделенные береговые линии · {lines.length}</h2>
    <p className="text-sm text-muted-foreground">Раздельные участки и острова не соединены. Выберите нужную линию для дальнейшего расчёта; файл подставится без скачивания и повторной загрузки.</p>
    <p className="text-sm text-muted-foreground">Для CERC дополнительно нужны волны и батиметрия именно этого участка. Открытая линия берега не заменяет замкнутую границу морской области для Gmsh.</p>
    <ul className="space-y-3">{lines.map((file, index) => <li key={file.id} className="min-w-0 space-y-2 rounded-xl border p-3">
      <p className="font-medium">Линия {index + 1} · <span className="text-xs break-all text-muted-foreground">{file.filename}</span></p>
      <div className="flex flex-wrap gap-2">
        {(["dimension_file", "erosion_file"] as const).map((kind) => kinds.some((entry) => entry.kind === kind) ? <Button key={kind} asChild variant="outline" className="h-auto min-h-11 whitespace-normal text-left">
          <Link to={coastlineContinuationUrl({ kind, artifactId: file.id, sourceJobId: job.id })}>{kind === "dimension_file" ? "Размерность этой линии" : "CERC по этой линии"}</Link>
        </Button> : <p key={kind} className="text-xs text-muted-foreground">{kind === "dimension_file" ? "Расчёт размерности" : "CERC"} отключён на сервере.</p>)}
        <Button asChild variant="link"><a href={file.downloadUrl} target="_blank" rel="noopener noreferrer">Скачать GeoJSON<span className="sr-only"> линии {index + 1}</span></a></Button>
      </div>
    </li>)}</ul>
  </section>;
}
