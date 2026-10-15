import { useState } from "react";
import {
  Calculator,
  ChartNoAxesCombined,
  Database,
  FlaskConical,
  LogOut,
  Plus,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { LAB_NAV_ITEMS, ROUTES } from "@/shared/config/routes";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/shadcn/components/ui/dropdown-menu";
import { RippleButton } from "@/shared/shadcn/ui/ripple-button";

const labIcons = [
  FlaskConical,
  Calculator,
  Database,
  ChartNoAxesCombined,
] as const;

export function DesktopActions() {
  const { isAuthenticated, logout, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const location = useLocation();

  return (
    <div className="hidden items-center gap-4 md:flex">
      {isAuthenticated ? (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <RippleButton
              aria-label={
                open ? "Закрыть меню пользователя" : "Открыть меню пользователя"
              }
              className="h-10 w-10 rounded-xl border p-0"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound aria-hidden="true" className="size-4" />
              </span>
            </RippleButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent id="account-menu" className="w-72">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Лаборатория</DropdownMenuLabel>
            <DropdownMenuItem
              asChild
              className="bg-primary/10 font-medium text-primary focus:bg-primary/15 focus:text-primary"
            >
              <Link to={`${ROUTES.lab}?new=1`}>
                <Plus aria-hidden="true" className="size-4" />
                Новый расчёт
              </Link>
            </DropdownMenuItem>
            {LAB_NAV_ITEMS.map((item, index) => {
              const Icon = labIcons[index];
              const isActive = item.end
                ? location.pathname === item.path
                : location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`);
              return (
                <DropdownMenuItem
                  key={item.path}
                  asChild
                  className={
                    isActive ? "bg-accent text-accent-foreground" : undefined
                  }
                >
                  <Link
                    to={item.path}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className={
                location.pathname === ROUTES.account
                  ? "bg-accent text-accent-foreground"
                  : undefined
              }
            >
              <Link
                to={ROUTES.account}
                aria-current={
                  location.pathname === ROUTES.account ? "page" : undefined
                }
              >
                <UserRound aria-hidden="true" className="size-4" />
                Аккаунт
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {logoutError && (
              <p role="alert" className="px-3 py-2 text-xs text-destructive">
                {logoutError}
              </p>
            )}
            <DropdownMenuItem
              className="text-destructive focus:bg-status-failed-background focus:text-destructive"
              onSelect={() => {
                setLogoutError("");
                void logout().catch(() => {
                  setLogoutError(
                    "Не удалось завершить сессию. Повторите попытку."
                  );
                  setOpen(true);
                });
              }}
            >
              <LogOut aria-hidden="true" className="size-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button asChild variant="outline">
          <Link to={ROUTES.login}>Войти</Link>
        </Button>
      )}
    </div>
  );
}
