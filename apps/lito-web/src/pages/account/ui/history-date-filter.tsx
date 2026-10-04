import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { ru } from "react-day-picker/locale";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Calendar } from "@/shared/shadcn/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/shadcn/components/ui/popover";

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000) return undefined;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

function dateValue(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function HistoryDateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const display = selected
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(selected)
    : value
      ? "Некорректная дата"
      : "Выберите дату";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={`${label}: ${display}`}
          aria-invalid={Boolean(value && !selected)}
          className="w-full min-w-0 justify-start gap-3 border-input bg-background px-3 text-left font-normal shadow-xs"
        >
          <CalendarDays aria-hidden="true" className="size-4 text-primary" />
          <span
            className={`min-w-0 flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}
          >
            {display}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        className="max-h-[calc(100dvh-1rem)] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
      >
        <Calendar
          mode="single"
          autoFocus
          locale={ru}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(dateValue(date));
            setOpen(false);
          }}
        />
        <div className="flex justify-end border-t border-border px-2 py-1">
          <Button
            type="button"
            variant="ghost"
            disabled={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Очистить дату
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
