import { useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { LAB_NAV_ITEMS } from "@/shared/config/routes";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Dialog } from "@/shared/shadcn/components/ui/dialog";
import { NewCalculationDialog } from "./new-calculation.page";
import { parseSeabedWorkflow } from "./model/seabed-workflows";
import { parseCoastlineContinuation } from "./model/coastline-continuation";

export function AccountPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const repeatJobId = searchParams.get("repeat");
  const createRequested = searchParams.get("new") === "1";
  const workflow = parseSeabedWorkflow(searchParams.get("workflow"));
  const sourceJobId = searchParams.get("source") ?? undefined;
  const initialDatasetId = searchParams.get("dataset") ?? undefined;
  const coastlineContinuation = useMemo(() => workflow ? undefined : parseCoastlineContinuation(searchParams), [searchParams, workflow]);
  const [newCalculationOpen, setNewCalculationOpen] = useState(false);
  const newCalculationTriggerRef = useRef<HTMLElement | null>(null);
  const calculationsLinkRef = useRef<HTMLAnchorElement>(null);

  function changeNewCalculationOpen(open: boolean) {
    if (open && document.activeElement instanceof HTMLElement) {
      newCalculationTriggerRef.current = document.activeElement;
    }
    setNewCalculationOpen(open);
    if (!open && (repeatJobId || createRequested)) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("repeat");
          next.delete("new");
          next.delete("workflow");
          next.delete("source");
          next.delete("scenario");
          next.delete("coastline");
          next.delete("dataset");
          return next;
        },
        { replace: true }
      );
    }
  }

  if (auth.loading) return <p role="status">Проверяем сессию…</p>;
  if (auth.checkError && !auth.isAuthenticated)
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-6">
        <p role="alert">Не удалось проверить сессию: {auth.checkError}</p>
        <Button type="button" onClick={() => void auth.retrySession()}>
          Повторить проверку
        </Button>
      </div>
    );
  if (!auth.isAuthenticated || !auth.user)
    return <Navigate to="/login" replace />;

  return (
    <Dialog
      open={newCalculationOpen || Boolean(repeatJobId) || createRequested}
      onOpenChange={changeNewCalculationOpen}
    >
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header>
          <p className="text-sm text-muted-foreground">
            Лаборатория · {auth.user.name}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Рабочее место для запуска, контроля и изучения.
          </p>
        </header>
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav
            aria-label="Разделы лаборатории"
            className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
          >
            {LAB_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                ref={
                  item.path === "/lab/calculations"
                    ? calculationsLinkRef
                    : undefined
                }
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </div>
        {(newCalculationOpen || repeatJobId || createRequested) && (
          <NewCalculationDialog
            key={repeatJobId ?? `${workflow ?? "new"}:${sourceJobId ?? ""}:${coastlineContinuation?.kind ?? ""}:${coastlineContinuation?.artifactId ?? ""}:${initialDatasetId ?? ""}`}
            repeatJobId={repeatJobId ?? undefined}
            workflow={repeatJobId ? undefined : workflow}
            sourceJobId={sourceJobId}
            coastlineContinuation={repeatJobId ? undefined : coastlineContinuation}
            initialDatasetId={repeatJobId || workflow || coastlineContinuation ? undefined : initialDatasetId}
            onOpenChange={changeNewCalculationOpen}
            onRestoreFocus={() => {
              const trigger = newCalculationTriggerRef.current;
              if (trigger?.isConnected) trigger.focus();
              else calculationsLinkRef.current?.focus();
            }}
          />
        )}
      </div>
    </Dialog>
  );
}
