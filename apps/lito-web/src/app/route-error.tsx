import { useRouteError } from "react-router-dom";

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
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Обновить страницу
        </button>
        <a
          href="/"
          className="rounded-lg border border-border px-4 py-2 font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          На главную
        </a>
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
