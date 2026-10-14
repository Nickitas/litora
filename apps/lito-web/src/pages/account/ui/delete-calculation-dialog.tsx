import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  CalculationDeletionOverviewDto,
  CalculationDeletionRequestDto,
  CalculationJobDto,
} from "@litora/contracts";
import { api } from "@/shared/api/client";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle,
} from "@/shared/shadcn/components/ui/dialog";
import { Input } from "@/shared/shadcn/components/ui/input";
import { Label } from "@/shared/shadcn/components/ui/label";

export function DeleteCalculationDialog({
  target, onClose, onQueued, onRestoreFocus,
}: {
  target: CalculationJobDto | "all" | undefined;
  onClose: () => void;
  onQueued: (request: CalculationDeletionRequestDto) => void;
  onRestoreFocus?: () => void;
}) {
  const [overview, setOverview] = useState<CalculationDeletionOverviewDto>();
  const [loading, setLoading] = useState(target === "all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (target !== "all") return;
    let mounted = true;
    void api.calculationDeletionOverview().then((result) => {
      if (mounted) setOverview(result);
    }).catch((nextError: unknown) => {
      if (mounted) setError(nextError instanceof Error ? nextError.message : "Не удалось проверить расчёты");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [target]);

  function close() {
    if (pending) return;
    setError("");
    setConfirmation("");
    onClose();
  }

  async function confirm() {
    if (!target || (target === "all" && confirmation !== "УДАЛИТЬ")) return;
    setPending(true);
    setError("");
    try {
      const request = target === "all"
        ? await api.deleteAllCalculations()
        : await api.deleteCalculation(target.id);
      onQueued(request);
      setConfirmation("");
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось запросить удаление");
    } finally {
      setPending(false);
    }
  }

  const all = target === "all";
  const blocked = all && overview
    ? overview.activeCount > 0 || overview.settlingCount > 0 || overview.deletingCount > 0
    : false;
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        className="max-w-lg p-6"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) { event.preventDefault(); onRestoreFocus(); }
        }}
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
        onInteractOutside={(event) => { if (pending) event.preventDefault(); }}
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold">
                {all ? "Очистить всю историю расчётов?" : "Удалить расчёт?"}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                {all
                  ? "Будут удалены все ваши расчёты, существующие на момент подтверждения, и их доступные файлы. Фильтры таблицы не учитываются. Отменить операцию нельзя."
                  : "Расчёт и его доступные файлы будут удалены без возможности восстановления из личного кабинета. Если результат используется другим расчётом, удаление будет заблокировано."}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" disabled={pending}
                aria-label="Закрыть окно удаления" className="size-11">
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
          {all && (
            <div className="rounded-xl border bg-muted/40 p-4 text-sm">
              {loading ? "Проверяем расчёты…" : overview ? (
                <p>
                  Всего расчётов: {overview.totalCount}. Активных: {overview.activeCount}.
                  {overview.settlingCount > 0 && ` Завершаются: ${overview.settlingCount}.`}
                  {overview.deletingCount > 0 && ` Уже удаляются: ${overview.deletingCount}.`}
                  {blocked && " Полная очистка станет доступна после завершения этих операций."}
                </p>
              ) : "Количество расчётов пока недоступно."}
            </div>
          )}
          {all && !blocked && overview && overview.totalCount > 0 && (
            <div className="space-y-2">
              <Label htmlFor="confirm-delete-all">Для подтверждения введите УДАЛИТЬ</Label>
              <Input id="confirm-delete-all" autoComplete="off" value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)} />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={close}>Отмена</Button>
            <Button type="button" variant="destructive"
              disabled={pending || loading || Boolean(blocked) || (all && (!overview?.totalCount || confirmation !== "УДАЛИТЬ"))}
              onClick={() => void confirm()}>
              {pending ? "Запрашиваем удаление…" : all ? "Удалить все расчёты" : "Удалить расчёт"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Старые версии объектов S3 и резервные копии удаляются по отдельной политике хранения.
            Техническая запись об операции хранится до 90 дней.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
