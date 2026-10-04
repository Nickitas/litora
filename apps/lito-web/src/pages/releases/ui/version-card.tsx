import {
  Calendar,
  Clock,
  Download,
  ExternalLink,
  Sparkles,
  Tag,
} from "lucide-react";
import { motion } from "motion/react";
import { MagicCard } from "@/shared/shadcn/ui/magic-card";
import { RippleButton } from "@/shared/shadcn/ui/ripple-button";
import { Button } from "@/shared/shadcn/components/ui/button";
import type { AppRelease } from "../constants";
import { releasesPageContent } from "../constants";

interface VersionCardProps {
  release: AppRelease;
  index: number;
}

export const VersionCard = ({ release, index }: VersionCardProps) => {
  const { unavailableLabel, availableLabel } = releasesPageContent;
  const releaseUrl = release.releaseUrl ?? release.downloadUrl ?? null;
  const isAvailable = releaseUrl !== null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.12, ease: "easeOut" }}
      className="relative pl-10 sm:pl-14"
    >
      <div
        className={`absolute top-8 left-3 z-10 size-3 -translate-x-1/2 rounded-full border-2 sm:left-5 sm:size-4 ${isAvailable
          ? "border-primary bg-primary"
          : "border-warning bg-warning-background"
          }`}
      />

      <MagicCard gradientSize={180} className="rounded-2xl">
        <article className="flex h-full flex-col p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Tag className="size-4" />
                </span>
                <div>
                  <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
                    {release.version}
                  </h3>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {isAvailable ? availableLabel : unavailableLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {release.isLatest && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Sparkles className="size-3" />
                  Актуальная
                </span>
              )}
              {!isAvailable && (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-background px-2.5 py-1 text-xs font-medium text-warning">
                  <Clock className="size-3" />
                  Архив восстанавливается
                </span>
              )}
            </div>
          </div>

          {release.description && (
            <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {release.description}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-4 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {release.releaseDate ? (
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                <Calendar className="size-3.5" />
                {release.releaseDate}
              </p>
            ) : (
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                <Clock className="size-3.5" />
                Дата релиза будет объявлена
              </p>
            )}

            {isAvailable ? (
              <Button asChild variant="outline" className="w-fit sm:min-w-52">
                <a
                  href={releaseUrl}
                  target={release.releaseUrl ? "_blank" : undefined}
                  rel={release.releaseUrl ? "noopener noreferrer" : undefined}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Download className="size-4" />
                    {release.releaseUrl
                      ? "Скачать на GitHub"
                      : "Скачать с сайта"}
                    {release.releaseUrl && (
                      <ExternalLink className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    )}
                  </span>
                </a>
              </Button>
            ) : (
              <RippleButton
                disabled
                className="w-fit cursor-not-allowed opacity-60 sm:min-w-52"
              >
                {unavailableLabel}
              </RippleButton>
            )}
          </div>
        </article>
      </MagicCard>
    </motion.li>
  );
};
