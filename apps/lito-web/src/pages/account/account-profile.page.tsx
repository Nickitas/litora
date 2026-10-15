import { ArrowRight, Bell, ShieldCheck, UserRound } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { ROUTES } from "@/shared/config/routes";
import { Badge } from "@/shared/shadcn/components/ui/badge";
import { Button } from "@/shared/shadcn/components/ui/button";
import { Card } from "@/shared/shadcn/components/ui/card";

const futureSections = [
  {
    icon: UserRound,
    title: "Данные профиля",
    description: "Изменение имени и адреса почты с подтверждением изменений.",
  },
  {
    icon: ShieldCheck,
    title: "Безопасность",
    description: "Пароль, активные сеансы и дополнительные способы защиты.",
  },
  {
    icon: Bell,
    title: "Уведомления",
    description:
      "Настройка сообщений о завершении расчётов и событиях аккаунта.",
  },
] as const;

export function AccountProfilePage() {
  const auth = useAuth();

  if (auth.loading) return <p role="status">Проверяем сессию…</p>;
  if (auth.checkError && !auth.isAuthenticated)
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-6">
        <p role="alert">Не удалось проверить сессию: {auth.checkError}</p>
        <Button type="button" onClick={() => void auth.retrySession()}>
          Повторить проверку
        </Button>
      </div>
    );
  if (!auth.isAuthenticated || !auth.user)
    return <Navigate to={ROUTES.login} replace />;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary">Личное пространство</p>
        <h1 className="text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
          Аккаунт
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Здесь будут настройки профиля и доступа. Исследования, данные и отчёты
          остаются в лаборатории.
        </p>
      </header>

      <Card className="grid gap-6 rounded-2xl p-5 shadow-sm sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {auth.user.name}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {auth.user.email}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Пока данные доступны только для просмотра. Редактирование появится
            после отдельной реализации и проверки безопасности.
          </p>
        </div>
        <Button asChild className="w-full md:w-auto">
          <Link to={ROUTES.lab}>
            Перейти в лабораторию
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </Card>

      <section aria-labelledby="account-future-heading" className="space-y-4">
        <div>
          <h2 id="account-future-heading" className="text-xl font-semibold">
            В планах для аккаунта
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Эти возможности ещё не работают и не меняют вашу учётную запись.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {futureSections.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="rounded-xl p-5 shadow-none">
              <div className="flex items-start justify-between gap-3">
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <Badge variant="secondary">Позже</Badge>
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
