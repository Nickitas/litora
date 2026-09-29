import { useTheme } from "@/shared/shadcn/components/theme-provider";
import { Particles } from "@/shared/shadcn/ui/particles";
import { Navbar } from "@/widgets/app-navigation";
import { Footer } from "@/widgets/footer";
import { ScrollToTop } from "@/shared/ui/scroll-to-top";
import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

const DocsShell = lazy(() =>
  import("@/pages/docs/ui/docs-shell").then((module) => ({
    default: module.DocsShell,
  }))
);

export function Layout({ children }: LayoutProps) {
  const { theme } = useTheme();
  const color = theme === "dark" ? "#ffffff" : "#000000";
  const location = useLocation();
  const isAuthPage = location.pathname === "/login";
  const isDocsPage =
    location.pathname === "/docs" ||
    location.pathname.startsWith("/docs/modules/") ||
    location.pathname.startsWith("/docs/capabilities/") ||
    location.pathname.startsWith("/docs/reference/");

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <ScrollToTop />
      <Particles
        className="fixed inset-0 z-0"
        quantity={100}
        ease={80}
        color={color}
        refresh
      />
      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-4 pt-20 pb-12">
          {isDocsPage ? (
            <Suspense
              fallback={
                <div role="status" className="min-h-64">
                  Загрузка документации…
                </div>
              }
            >
              <DocsShell>{children}</DocsShell>
            </Suspense>
          ) : (
            <div className="mx-auto">{children}</div>
          )}
        </main>
        {!isAuthPage && <Footer />}
      </div>
    </div>
  );
}
