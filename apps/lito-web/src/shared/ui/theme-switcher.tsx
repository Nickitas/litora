import { useTheme } from "@/shared/shadcn/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/components/ui/select";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <Select
        value={theme}
        onValueChange={(value) => setTheme(value as typeof theme)}
      >
      <SelectTrigger aria-label="Тема оформления" className="w-30">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">Система</SelectItem>
        <SelectItem value="light">Светлая</SelectItem>
        <SelectItem value="dark">Тёмная</SelectItem>
      </SelectContent>
    </Select>
  );
}
