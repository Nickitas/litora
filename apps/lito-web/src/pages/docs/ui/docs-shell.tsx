import type { ReactNode } from "react";
import { DocsSidebar } from "./docs-sidebar";
import { MobileDocsNav } from "./mobile-docs-nav";

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto">
      <MobileDocsNav />
      <div className="flex items-start gap-8">
        <DocsSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
