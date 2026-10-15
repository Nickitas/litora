import { Link } from "react-router";
import { Button } from "@/shared/shadcn/components/ui/button";

export const AccessSection = () => {
  return (
    <section className="space-y-6 rounded-lg border bg-muted/30 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
          Способы работы
        </p>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
          Исследуйте в браузере или запускайте ядро локально
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col items-start rounded-lg border bg-background p-5">
          <h3 className="text-lg font-semibold">
            Лаборатория исследователя
          </h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            Выбирайте доступный сценарий, загружайте свои данные и следите за
            расчётом. В лаборатории сохраняются история, параметры, метрики и файлы
            результатов. Доступ к пилоту — по приглашению.
          </p>
          <Button asChild className="mt-5">
            <Link to="/lab">Открыть лабораторию</Link>
          </Button>
        </div>
        <div className="flex flex-col items-start rounded-lg border bg-background p-5">
          <h3 className="text-lg font-semibold">Самостоятельный Litora CLI</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            Скачайте отдельный выпуск вычислительного ядра Go для локального
            запуска и автоматизации. CLI работает без личного кабинета; его
            команды и специальные параметры описаны в документации.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/downloads">Скачать CLI</Link>
            </Button>
            <Button asChild variant="link">
              <Link to="/releases">История версий CLI</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
