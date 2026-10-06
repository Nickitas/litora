import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

export const maxOutputFiles = 256;
export const maxOutputDirectories = 256;
export const maxOutputBytes = 100 * 1024 * 1024;
export const maxHeavyOutputBytes = 8 * 1024 * 1024 * 1024;

/** Периодическая программная проверка каталога; не заменяет дисковую квоту ОС. */
export async function assertOutputBudget(
  directory: string,
  profile: "standard" | "heavy" = "standard",
): Promise<void> {
  const maximumBytes = profile === "heavy" ? maxHeavyOutputBytes : maxOutputBytes;
  const maximumFiles = profile === "heavy" ? 512 : maxOutputFiles;
  const maximumDirectories = profile === "heavy" ? 512 : maxOutputDirectories;
  const pending = [directory];
  let files = 0;
  let directories = 0;
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await opendir(current);
    } catch (error) {
      // Go может удалить временный вложенный каталог между двумя обходами.
      if (
        current !== directory &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        continue;
      throw error;
    }
    for await (const entry of entries) {
      const path = join(current, entry.name);
      let info;
      try {
        info = await lstat(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (info.isDirectory()) {
        if (++directories > maximumDirectories)
          throw new Error("Превышен лимит каталогов результата");
        pending.push(path);
      } else if (info.isFile()) {
        if (++files > maximumFiles)
          throw new Error("Превышен лимит файлов результата");
        bytes += info.size;
        if (bytes > maximumBytes)
          throw new Error("Превышен лимит размера результата");
      } else {
        throw new Error("В результате обнаружен недопустимый тип файла");
      }
    }
  }
}
