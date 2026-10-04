import { useRouteError } from "react-router-dom";
import { Button } from "@/shared/shadcn/components/ui/button";

export function RouteError() {
  const error = useRouteError();
  const moduleUnavailable =
    error instanceof Error &&
    /Failed to fetch dynamically imported module/.test(error.message);

  return (
    <main
      role="alert"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-5 px-6 py-12"
    >
      <h1 className="text-3xl font-semibold text-foreground">
        Не удалось открыть страницу
      </h1>
      <p className="text-muted-foreground">
        {moduleUnavailable
          ? "Браузер не загрузил обновлённый модуль приложения. Обновите страницу и попробуйте снова."
          : "Произошла неожиданная ошибка. Попробуйте обновить страницу."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => window.location.reload()}>
          Обновить страницу
        </Button>
        <Button asChild variant="outline">
          <a href="/">На главную</a>
        </Button>
      </div>
      {moduleUnavailable && (
        <p className="text-sm text-muted-foreground">
          Если ошибка повторится, обновите вкладку без кеша: ⌘⇧R на macOS или
          Ctrl+Shift+R на Windows и Linux.
        </p>
      )}
    </main>
  );
}
