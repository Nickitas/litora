import type { DownloadFile } from "@/shared/api";
import { Monitor as MonitorIcon, ChevronDown, Check } from "lucide-react";
import { SiApple, SiLinux } from "@icons-pack/react-simple-icons";
import { RippleButton } from "@/shared/shadcn/ui/ripple-button";
import { useState } from "react";
import confetti from "canvas-confetti";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/shadcn/components/ui/collapsible";

interface DownloadCardProps {
  file: DownloadFile;
  onDownload: (file: DownloadFile) => void;
}

interface ChangelogProps {
  items: string[];
}

const Changelog = ({ items }: ChangelogProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-muted/30 px-4 hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check aria-hidden="true" className="size-3" />
            </span>
            Что нового в этой версии
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 text-muted-foreground transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border border-border/50 bg-background/50 p-4">
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  •
                </span>
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const triggerConfetti = () => {
  const duration = 3 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  const randomInRange = (min: number, max: number) =>
    Math.random() * (max - min) + min;

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    // Launch confetti from left side
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });

    // Launch confetti from right side
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);

  // Initial burst from center
  confetti({
    ...defaults,
    particleCount: 100,
    spread: 70,
    origin: { x: 0.5, y: 0.6 },
  });
};

export function DownloadCard({ file, onDownload }: DownloadCardProps) {
  const getOsIcon = (os: DownloadFile["os"]) => {
    const iconClass = "size-10";
    switch (os) {
      case "windows":
        return <MonitorIcon className={iconClass} />;
      case "macos":
        return <SiApple className={iconClass} />;
      case "linux":
        return <SiLinux className={iconClass} />;
    }
  };

  const handleDownload = () => {
    triggerConfetti();
    onDownload(file);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border p-6 transition-colors hover:border-primary/50">
      {/* Header */}
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {getOsIcon(file.os)}
          <div className="min-w-0">
            <h3 className="font-semibold break-all">{file.name}</h3>
            <p className="text-sm text-muted-foreground capitalize">
              {file.os}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {file.version}
        </span>
      </div>

      {/* Info */}
      <div className="mb-4 space-y-1 text-sm text-muted-foreground">
        <p>Размер: {file.size}</p>
        <p>Сборка: {file.goVersion}</p>
        <p className="text-xs">{file.requirements}</p>
        {file.os === "macos" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            💡 Выберите версию в соответствии с вашим процессором
          </p>
        )}
      </div>

      {/* Changelog - can expand */}
      {file.changelog.length > 0 && <Changelog items={file.changelog} />}

      {/* Spacer to push button to bottom */}
      <div className="flex-1" />

      {/* Button always at bottom */}
      {file.disabled ? (
        <RippleButton disabled className="w-full cursor-not-allowed opacity-50">
          {file.disabledReason || "Скоро появится"}
        </RippleButton>
      ) : (
        <RippleButton onClick={handleDownload} className="w-full">
          Скачать
        </RippleButton>
      )}
    </div>
  );
}
