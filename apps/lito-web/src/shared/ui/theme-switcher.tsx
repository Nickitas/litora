import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/shared/shadcn/components/theme-provider";
import { Button } from "@/shared/shadcn/components/ui/button";

const themeOptions = {
  light: { icon: Sun, label: "светлая", next: "dark" },
  dark: { icon: Moon, label: "тёмная", next: "system" },
  system: { icon: Monitor, label: "системная", next: "light" },
} as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const option = themeOptions[theme];
  const Icon = option.icon;
  const label = `Тема оформления: ${option.label}. Следующая: ${themeOptions[option.next].label}.`;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      data-theme={theme}
      aria-label={label}
      title={label}
      onClick={() => setTheme(option.next)}
      className="size-11 rounded-full border-input bg-card text-primary shadow-xs hover:bg-accent hover:text-accent-foreground"
    >
      <Icon aria-hidden="true" className="size-5" />
    </Button>
  );
}
