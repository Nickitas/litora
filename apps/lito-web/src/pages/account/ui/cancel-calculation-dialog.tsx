import { useState } from "react";
import type { CalculationJobDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Dialog,
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
}: {
  job: CalculationJobDto | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (job: CalculationJobDto) => Promise<void>;
  title: string;
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
        if (!pending || nextOpen) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-w-lg p-6"
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
      <div className="space-y-4">
        <div>
          <DialogTitle className="text-xl font-semibold">
            Отменить расчёт?
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            {job
              ? "Выбранный расчёт будет остановлен. История сохранится, но результат может остаться неполным."
              : "Расчёт будет остановлен."}
          </DialogDescription>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={close}
          >
            Не отменять
          </Button>
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
