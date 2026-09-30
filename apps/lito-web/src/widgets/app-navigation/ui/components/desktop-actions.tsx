import { useAuth } from "@/features/auth";
import { ROUTES } from "@/shared/config/routes";
import { Link } from "react-router";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { RippleButton } from "@/shared/shadcn/ui/ripple-button";
import { Button } from "@/shared/shadcn/components/ui/button";

export const DesktopActions = () => {
  const { isAuthenticated, logout, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      accountButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="hidden items-center gap-4 md:flex">
      {isAuthenticated ? (
        <div className="relative">
          <RippleButton
            ref={accountButtonRef}
            aria-expanded={open}
            aria-controls="account-menu"
            aria-label={
              open ? "Закрыть меню пользователя" : "Открыть меню пользователя"
            }
            onClick={() => setOpen(!open)}
            className="h-10 max-w-56 flex-row gap-2 rounded-xl border px-3 py-1.5 text-sm sm:max-w-64"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <UserRound className="size-4" />
            </span>
          </RippleButton>
          {open && (
            <div
              id="account-menu"
              className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-60 rounded-xl border bg-background/95 p-2 shadow-2xl backdrop-blur"
            >
              <div className="mb-1 border-b px-3 py-2">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <UserRound className="size-4" />
                Личный кабинет
              </Link>
              <div className="my-1 border-t" />
              {logoutError && (
                <p role="alert" className="px-3 text-xs text-destructive">
                  {logoutError}
                </p>
              )}
              <button
                onClick={() => {
                  void logout()
                    .then(() => setOpen(false))
                    .catch(() =>
                      setLogoutError(
                        "Не удалось завершить сессию. Повторите попытку."
                      )
                    );
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-status-failed-background"
              >
                <LogOut className="size-4" />
                Выйти
              </button>
            </div>
          )}
        </div>
      ) : (
        <Button asChild variant="outline">
          <Link to={ROUTES.login}>Войти</Link>
        </Button>
      )}
    </div>
  );
};
