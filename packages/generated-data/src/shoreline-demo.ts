import type { ShorelinePointSeriesDto, ShorelineVisualizationChunkDto, ShorelineVisualizationIndexDto } from "@litora/contracts";
import { demoIndex } from "./shoreline-demo-index";

// Сохранённый результат Go CLI: lito erosion --black-sea-sochi --offline --steps 168 --svg-max-frames 12.
// Численные значения и временные метки получены из Go; web их не пересчитывает.
export const shorelineDemoIndex: ShorelineVisualizationIndexDto = demoIndex;

export async function loadShorelineDemoChunk(id: string): Promise<ShorelineVisualizationChunkDto> {
  if (id === "000001") return (await import("./shoreline-demo-chunk-000001")).demoChunk000001;
  if (id === "000002") return (await import("./shoreline-demo-chunk-000002")).demoChunk000002;
  if (id === "000003") return (await import("./shoreline-demo-chunk-000003")).demoChunk000003;
  throw new Error(`Не найдена часть демонстрационного ряда ${id}`);
}

export async function loadShorelineDemoPointSeries(pointIndex: number): Promise<ShorelinePointSeriesDto> {
  const series = (await import("./shoreline-demo-series")).demoSeries[pointIndex];
  if (!series) throw new Error(`Не найден ряд демонстрационного узла ${pointIndex + 1}`);
  return series;
}
