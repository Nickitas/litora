import type { CalculationKindDto } from "@litora/contracts";
import { ArrowUpRight, CircleHelp, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/shadcn/components/ui/dialog";
import { scenarioGuidance } from "../model/scenario-guidance";

export function CalculationScenarioHelp({ scenario, open, onOpenChange }: {
  scenario: CalculationKindDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const guidance = scenarioGuidance[scenario.kind];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon"
          className="size-11 shrink-0" aria-label={`Справка о расчёте «${scenario.title}»`}>
          <CircleHelp aria-hidden="true" className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-xl flex-col overflow-clip p-0">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0 space-y-2">
            <DialogTitle>Справка: {scenario.title}</DialogTitle>
            <DialogDescription>Входные данные и ограничения выбранного расчёта.</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0"
              aria-label="Закрыть справку">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>
        <div data-slot="calculation-help-body" role="region" aria-label="Содержание справки" tabIndex={0}
          className="min-h-0 space-y-4 overflow-y-auto p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <p className="text-sm text-muted-foreground">{scenario.description}</p>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium">Входные данные</dt>
              <dd className="mt-1 text-muted-foreground">{guidance.source}</dd>
            </div>
            <div>
              <dt className="font-medium">Ограничения</dt>
              <dd className="mt-1 text-muted-foreground">{guidance.limitation}</dd>
            </div>
          </dl>
        </div>
        <footer className="shrink-0 border-t px-5 py-3">
          <Link to={guidance.reference.href} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {guidance.reference.label}
            <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">(откроется в новой вкладке)</span>
          </Link>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
