import { useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Dialog } from "@/shared/shadcn/components/ui/dialog";
import { NewCalculationDialog } from "./new-calculation.page";

const navigation = [
  { to: "/account", label: "Обзор", end: true },
  { to: "/account/calculations", label: "Расчёты", end: true },
] as const;

export function AccountPage() {
  const auth = useAuth();
  const [newCalculationOpen, setNewCalculationOpen] = useState(false);

  if (auth.loading) return <p role="status">Проверяем сессию…</p>;
  if (!auth.isAuthenticated || !auth.user)
    return <Navigate to="/login" replace />;

  return (
    <Dialog open={newCalculationOpen} onOpenChange={setNewCalculationOpen}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header>
          <p className="text-sm text-muted-foreground">
            Личный кабинет · {auth.user.name}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Рабочее место для запуска, контроля и изучения собственных расчётов.
          </p>
        </header>
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav
            aria-label="Разделы личного кабинета"
            className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
          >
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
        {newCalculationOpen && (
          <NewCalculationDialog onOpenChange={setNewCalculationOpen} />
        )}
      </div>
    </Dialog>
  );
}
