import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { DesktopNavigation } from "./components/desktop-navigation";
import { Brand } from "./components/brand";
import { DesktopActions } from "./components/desktop-actions";
import { ThemeSwitcher } from "@/shared/ui/theme-switcher";
import { ScrollProgress } from "@/shared/shadcn/ui/scroll-progress";

const MobileMenu = lazy(() =>
  import("./components/mobile-menu").then((module) => ({
    default: module.MobileMenu,
  }))
);

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuRequested, setMobileMenuRequested] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed z-50 w-full max-w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto flex min-w-0 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Brand
            setMobileMenuOpen={() => setMobileMenuOpen(false)}
            to={ROUTES.home}
          />
          <DesktopNavigation isActive={isActive} />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeSwitcher />
            <DesktopActions />
          </div>

          {/* Animated Mobile Menu Button */}
          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="group relative flex size-11 items-center justify-center rounded-lg border border-input bg-background transition-all hover:border-ring hover:bg-muted md:hidden"
            onClick={() => {
              setMobileMenuRequested(true);
              setMobileMenuOpen(!mobileMenuOpen);
            }}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          >
            <div aria-hidden="true" className="relative">
              <Menu
                className={`absolute size-6 transition-all duration-300 ${
                  mobileMenuOpen
                    ? "scale-0 rotate-90 opacity-0"
                    : "scale-100 rotate-0 opacity-100"
                }`}
              />
              <X
                className={`size-6 transition-all duration-300 ${
                  mobileMenuOpen
                    ? "scale-100 rotate-0 opacity-100"
                    : "scale-0 -rotate-90 opacity-0"
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu with animation */}
      {mobileMenuRequested && (
        <Suspense
          fallback={
            mobileMenuOpen ? (
              <div role="status" className="px-4 py-6 md:hidden">
                Загрузка меню…
              </div>
            ) : null
          }
        >
          <MobileMenu
            isActive={isActive}
            isOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
        </Suspense>
      )}
      <ScrollProgress />
    </nav>
  );
}
