import { useState } from "react";
import type { CalculationArtifactDto } from "@litora/contracts";
import { Button } from "@/shared/shadcn/components/ui/button";
import { cn } from "@/shared/shadcn/lib/utils";

export function CalculationImagePreview({
  file,
  alt,
  compact = false,
  onRefreshLinks,
}: {
  file: CalculationArtifactDto;
  alt: string;
  compact?: boolean;
  onRefreshLinks?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [failedKey, setFailedKey] = useState("");
  const [showLarge, setShowLarge] = useState(false);
  const largePreview = file.sizeBytes > 8 * 1024 * 1024;
  const imageKey = `${file.downloadUrl}:${attempt}`;
  const failed = failedKey === imageKey;
  const loading = !failed && (!largePreview || showLarge) && loadedKey !== imageKey;

  return (
    <figure
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card",
        compact && "rounded-lg"
      )}
    >
      {largePreview && !showLarge ? (
        <div className="space-y-3 bg-muted/35 p-4 text-sm">
          <p>Большое изображение ({Math.ceil(file.sizeBytes / 1024 / 1024)} МиБ) не загружается автоматически, чтобы кабинет оставался отзывчивым.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => setShowLarge(true)}>
              Показать изображение
            </Button>
            <a href={file.downloadUrl} target="_blank" rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
              Открыть файл
            </a>
          </div>
        </div>
      ) : failed ? (
        <div
          role="alert"
          className="space-y-3 bg-status-failed-background p-4 text-sm text-status-failed"
        >
          <p>Предпросмотр недоступен: ссылка устарела или файл отсутствует.</p>
          {onRefreshLinks ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAttempt((value) => value + 1);
                onRefreshLinks();
              }}
            >
              Обновить ссылки и повторить
            </Button>
          ) : (
            <p>Откройте полный отчёт, чтобы обновить ссылки.</p>
          )}
        </div>
      ) : (
        <div
          className="relative flex min-h-40 items-center justify-center bg-white"
          aria-busy={loading}
        >
          {loading && (
            <p
              role="status"
              className="absolute rounded-lg bg-card px-3 py-2 text-sm text-card-foreground shadow-sm"
            >
              Загружаем изображение…
            </p>
          )}
          <img
            key={imageKey}
            src={file.downloadUrl}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoadedKey(imageKey)}
            onError={() => setFailedKey(imageKey)}
            className={cn(
              "w-full object-contain",
              compact ? "max-h-72" : "max-h-96",
              loading && "opacity-0"
            )}
          />
        </div>
      )}
      <figcaption className={cn("text-sm break-all", compact ? "p-2" : "p-3")}>
        {file.filename}
      </figcaption>
    </figure>
  );
}
