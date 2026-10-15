import { DatePicker } from "@/shared/shadcn/components/ui/date-picker";

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
  return (
    <DatePicker
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      clearable
    />
  );
}
