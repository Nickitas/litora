export type ShorelineTimeUnit = "year" | "month" | "week" | "day";

export function periodStart(date: Date, unit: ShorelineTimeUnit): Date {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  if (unit === "year") start.setUTCMonth(0, 1);
  if (unit === "month") start.setUTCDate(1);
  if (unit === "week")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

export function shiftPeriod(
  date: Date,
  unit: ShorelineTimeUnit,
  offset: number
): Date {
  const next = periodStart(date, unit);
  if (unit === "year") next.setUTCFullYear(next.getUTCFullYear() + offset);
  if (unit === "month") next.setUTCMonth(next.getUTCMonth() + offset);
  if (unit === "week") next.setUTCDate(next.getUTCDate() + offset * 7);
  if (unit === "day") next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

export function periodLabel(date: Date, unit: ShorelineTimeUnit): string {
  const start = periodStart(date, unit);
  if (unit === "year") return String(start.getUTCFullYear());
  if (unit === "month")
    return new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  if (unit === "day")
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  const end = shiftPeriod(start, "week", 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const format = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${format.format(start)} — ${format.format(end)} ${end.getUTCFullYear()}`;
}
