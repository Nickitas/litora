import { Link } from "react-router";
import { DownloadGuard, DownloadList } from "@/features/downloads";
import { Button } from "@/shared/shadcn/components/ui/button";
import { ROUTES } from "@/shared/config/routes";
import { HeroSection } from "./ui/hero-section";
import { AuthNotice } from "./ui/auth-notice";
import { SourceCode } from "./ui/source-code";
import { Changelog } from "./ui/changelog";

export function DownloadsPage() {
  return (
    <DownloadGuard>
      <div className="space-y-6 sm:space-y-8">
        <HeroSection />
        <Button asChild variant="outline">
          <Link to={ROUTES.releases}>История версий CLI</Link>
        </Button>
        <AuthNotice />
        <DownloadList />
        <SourceCode />
        <Changelog />
      </div>
    </DownloadGuard>
  );
}
