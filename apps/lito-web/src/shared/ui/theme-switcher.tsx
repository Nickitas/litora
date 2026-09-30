import { useTheme } from "@/shared/shadcn/components/theme-provider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <label className="flex items-center">
      <span className="sr-only">Тема оформления</span>
      <select
        aria-label="Тема оформления"
        value={theme}
        onChange={(event) => setTheme(event.target.value as typeof theme)}
        className="min-h-11 rounded-lg border border-input bg-card px-2 text-sm text-card-foreground focus-visible:border-ring"
      >
        <option value="system">Система</option>
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
      </select>
    </label>
  );
}
