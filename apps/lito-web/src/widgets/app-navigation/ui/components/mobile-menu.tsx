import { Link } from "react-router";
import { NAV_ITEMS } from "../../config";
import { useAuth } from "@/features/auth";
import { LAB_NAV_ITEMS, ROUTES } from "@/shared/config/routes";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Calculator,
  ChartNoAxesCombined,
  ChevronRight,
  Database,
  FlaskConical,
  LogOut,
  Plus,
  User,
  UserRound,
} from "lucide-react";
import { RippleButton } from "@/shared/shadcn/ui/ripple-button";
import { Button } from "@/shared/shadcn/components/ui/button";

type MobileMenuProps = {
  isActive: (path: string) => boolean;
  isOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
};

const labIcons = [
  FlaskConical,
  Calculator,
  Database,
  ChartNoAxesCombined,
] as const;

export const MobileMenu = ({
  isActive,
  isOpen,
  setMobileMenuOpen,
}: MobileMenuProps) => {
  const { isAuthenticated, logout, user } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const reduceMotion = useReducedMotion();

  const menuVariants = {
    closed: {
      opacity: 0,
      height: 0,
      transition: {
        duration: reduceMotion ? 0 : 0.3,
        ease: [0.4, 0, 0.2, 1] as const,
      },
    },
    open: {
      opacity: 1,
      height: "auto",
      transition: {
        duration: reduceMotion ? 0 : 0.3,
        ease: [0.4, 0, 0.2, 1] as const,
      },
    },
  };

  const itemVariants = {
    closed: {
      opacity: 0,
      x: reduceMotion ? 0 : -20,
      transition: {
        duration: reduceMotion ? 0 : 0.2,
      },
    },
    open: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        duration: reduceMotion ? 0 : 0.25,
        delay: reduceMotion ? 0 : i * 0.05,
        ease: [0, 0, 0.2, 1] as const,
      },
    }),
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="mobile-navigation"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
          initial={reduceMotion ? false : "closed"}
          animate="open"
          exit="closed"
          variants={menuVariants}
        >
          <div className="container mx-auto space-y-1 px-4 py-6">
            {NAV_ITEMS.map((item, index) => (
              <motion.div
                key={item.path}
                custom={index}
                variants={itemVariants}
                initial={reduceMotion ? false : "closed"}
                animate="open"
              >
                <Link
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className="group flex items-center justify-between rounded-lg px-4 py-3 text-sm transition-all duration-200 hover:bg-muted/50"
                >
                  <span
                    className={`font-medium transition-colors ${
                      isActive(item.path)
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                  <ChevronRight
                    className={`size-4 transition-all duration-200 ${
                      isActive(item.path)
                        ? "translate-x-0 text-primary opacity-100"
                        : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                    }`}
                  />
                </Link>
              </motion.div>
            ))}

            <motion.div
              custom={NAV_ITEMS.length}
              variants={itemVariants}
              initial={reduceMotion ? false : "closed"}
              animate="open"
              className="border-t border-border/50 pt-4"
            >
              {isAuthenticated ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <User className="size-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </div>

                  <div
                    role="group"
                    aria-label="Разделы лаборатории"
                    className="space-y-1"
                  >
                    <p className="px-4 text-xs font-medium text-muted-foreground">
                      Лаборатория
                    </p>
                    <Link
                      to={`${ROUTES.lab}?new=1`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      Новый расчёт
                    </Link>
                    {LAB_NAV_ITEMS.map((item, index) => {
                      const Icon = labIcons[index];
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          aria-current={
                            isActive(item.path) ? "page" : undefined
                          }
                          className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                        >
                          <Icon
                            aria-hidden="true"
                            className="size-4 text-primary"
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>

                  <Link
                    to={ROUTES.account}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={isActive(ROUTES.account) ? "page" : undefined}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
                  >
                    <UserRound
                      aria-hidden="true"
                      className="size-4 text-primary"
                    />
                    Аккаунт
                  </Link>

                  {logoutError && (
                    <p role="alert" className="text-sm text-destructive">
                      {logoutError}
                    </p>
                  )}
                  <RippleButton
                    onClick={() => {
                      void logout()
                        .then(() => setMobileMenuOpen(false))
                        .catch(() =>
                          setLogoutError(
                            "Не удалось завершить сессию. Повторите попытку."
                          )
                        );
                    }}
                    className="w-full"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>Выйти</span>
                      <LogOut className="size-4" />
                    </span>
                  </RippleButton>
                </div>
              ) : (
                <Button asChild variant="outline" className="w-fit">
                  <Link
                    to={ROUTES.login}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>Войти</span>
                      <ChevronRight className="size-4" />
                    </span>
                  </Link>
                </Button>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
