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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:border focus:bg-card focus:px-4 focus:py-3 focus:text-card-foreground focus:shadow-lg"
      >
        Перейти к содержимому
      </a>
      <div>
        <Navbar />
        <main
          id="main-content"
          tabIndex={-1}
          className="container mx-auto px-4 pt-20 pb-12"
        >
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
