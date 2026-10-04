import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import type { CalculationStatus as Status } from "@litora/contracts";

const presentation = {
  queued: {
    label: "В очереди",
    icon: Clock3,
    className: "bg-status-queued-background text-status-queued",
  },
  running: {
    label: "Выполняется",
    icon: LoaderCircle,
    className: "bg-status-running-background text-status-running",
  },
  succeeded: {
    label: "Завершён",
    icon: CircleCheck,
    className: "bg-status-succeeded-background text-status-succeeded",
  },
  failed: {
    label: "Ошибка",
    icon: CircleAlert,
    className: "bg-status-failed-background text-status-failed",
  },
  cancelled: {
    label: "Отменён",
    icon: CircleSlash,
    className: "bg-status-queued-background text-status-queued",
  },
} satisfies Record<
  Status,
  { label: string; icon: typeof Clock3; className: string }
>;

export function CalculationStatus({ status }: { status: Status }) {
  const { label, icon: Icon, className } = presentation[status];
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon
        aria-hidden="true"
        className={`size-4 ${status === "running" ? "animate-spin motion-reduce:animate-none" : ""}`}
      />
      {label}
    </span>
  );
}
