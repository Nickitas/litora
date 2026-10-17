import { useMemo } from "react";

type DatedFrame = { time: string | null };

function yearBuckets(frames: readonly DatedFrame[]) {
  const dated = frames.flatMap((frame, position) => frame.time ? [{ year: new Date(frame.time).getUTCFullYear(), position }] : []);
  const first = dated[0];
  const last = dated[dated.length - 1];
  if (!first || !last) return [];
  const firstYear = first.year;
  const lastYear = last.year;
  const size = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 80));
  const buckets: { from: number; to: number; count: number; lastPosition: number }[] = [];
  for (let year = firstYear; year <= lastYear; year += size) {
    buckets.push({ from: year, to: Math.min(lastYear, year + size - 1), count: 0, lastPosition: -1 });
  }
  for (const item of dated) {
    const bucket = buckets[Math.floor((item.year - firstYear) / size)];
    bucket.count++;
    bucket.lastPosition = item.position;
  }
  return buckets;
}

export function ShorelineYearNavigator({
  frames,
  selectedPosition,
  onSelectPosition,
  label,
}: {
  frames: readonly DatedFrame[];
  selectedPosition: number | null;
  onSelectPosition: (position: number) => void;
  label: string;
}) {
  const years = useMemo(() => yearBuckets(frames), [frames]);
  if (years.length === 0) return null;
  const maxCount = Math.max(1, ...years.map((item) => item.count));
  const total = years.reduce((sum, item) => sum + item.count, 0);
  const occupied = new Set(frames.flatMap((frame) => frame.time ? [new Date(frame.time).getUTCFullYear()] : [])).size;
  const selectedTime = selectedPosition === null ? null : frames[selectedPosition]?.time;
  const selectedYear = selectedTime ? new Date(selectedTime).getUTCFullYear() : null;

  return <div className="space-y-2 rounded-lg border bg-muted/20 p-3" aria-label={label}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className="text-xs text-muted-foreground">
        {total} дат · годы с данными: {occupied} · пустые периоды не заполнены
      </p>
    </div>
    <div className="flex gap-1 overflow-x-auto pb-2" role="group" aria-label={`Перейти к году: ${label.toLowerCase()}`}>
      {years.map((item) => {
        const active = selectedYear !== null && selectedYear >= item.from && selectedYear <= item.to;
        const yearLabel = item.from === item.to ? String(item.from) : `${item.from}–${item.to}`;
        return <button key={item.from} type="button"
          disabled={item.count === 0}
          aria-label={`${yearLabel}: ${item.count} дат`}
          aria-pressed={active}
          onClick={() => onSelectPosition(item.lastPosition)}
          className="flex h-24 min-w-16 shrink-0 flex-col items-center justify-end gap-1 rounded-md border bg-card px-1 py-2 text-xs transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-primary aria-pressed:bg-primary/10"
        >
          <span className="text-muted-foreground">{item.count || "—"}</span>
          <span className="w-5 rounded-sm bg-primary/75" style={{ height: `${item.count ? Math.max(5, Math.round(item.count / maxCount * 43)) : 2}px` }} />
          <span>{yearLabel}</span>
        </button>;
      })}
    </div>
    <p className="text-xs text-muted-foreground">Выберите год, чтобы открыть его последнее состояние. Высота столбца показывает количество дат, а не величину изменения берега.</p>
  </div>;
}
