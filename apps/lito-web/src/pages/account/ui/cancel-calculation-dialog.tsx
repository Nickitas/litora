import { useState } from "react";
import { X } from "lucide-react";
import type { CalculationJobDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/shadcn/components/ui/dialog";

export function CancelCalculationDialog({
  job,
  open,
  onOpenChange,
  onConfirm,
  title,
  onRestoreFocus,
}: {
  job: CalculationJobDto | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (job: CalculationJobDto) => Promise<void>;
  title: string;
  onRestoreFocus?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  async function confirm() {
    if (!job) return;
    setPending(true);
    setError("");
    try {
      await onConfirm(job);
      setError("");
      onOpenChange(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Не удалось отменить расчёт"
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent
        className="max-w-lg p-6"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold">
                Отменить расчёт?
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                {job
                  ? "Выбранный расчёт будет остановлен. История сохранится, но результат может остаться неполным."
                  : "Расчёт будет остановлен."}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label="Закрыть окно отмены расчёта"
                className="size-11"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !job}
              onClick={() => void confirm()}
            >
              {pending ? "Отменяем…" : title}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
