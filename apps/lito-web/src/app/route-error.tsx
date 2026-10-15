import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { Button } from "@/shared/shadcn/components/ui/button";
import {
  canRecoverModule,
  isModuleLoadError,
  recoverModule,
} from "./module-recovery";

export function RouteError() {
  const error = useRouteError();
  const moduleUnavailable = isModuleLoadError(error);
  const restoring = moduleUnavailable && canRecoverModule();

  useEffect(() => {
    if (restoring) recoverModule();
  }, [restoring]);

  if (restoring) {
    return (
      <main
        role="status"
        className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12 text-muted-foreground"
      >
        Восстанавливаем страницу…
      </main>
    );
  }

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
          ? navigator.onLine === false
            ? "Нет соединения с сетью. Проверьте подключение и повторите попытку."
            : "Не удалось загрузить часть приложения. Проверьте подключение и повторите попытку."
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
    </main>
  );
}
