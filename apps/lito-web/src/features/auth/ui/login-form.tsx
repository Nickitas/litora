import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/shared/shadcn/components/ui/button";
import { fieldControlClass } from "@/shared/ui/field-styles";
import { useAuth } from "../model";

export function LoginForm() {
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.loading) return <p role="status">Проверяем сессию…</p>;
  if (auth.isAuthenticated) return <Navigate to="/account" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      if (registering)
        await auth.register({ name, email, password, invitationCode });
      else await auth.login({ email, password });
      navigate("/account");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
      <h1 className="text-[28px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
        {registering ? "Создать аккаунт" : "Войти в Litora"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Запускайте расчёты и храните отчёты в личном кабинете.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={pending}>
        {registering && (
          <label className="block">
            Имя
            <input
              className={fieldControlClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              required
            />
          </label>
        )}
        <label className="block">
          Почта
          <input
            className={fieldControlClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <label className="block">
          Пароль
          <input
            className={fieldControlClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registering ? "new-password" : "current-password"}
            minLength={10}
            maxLength={128}
            required
          />
        </label>
        <p className="text-xs text-muted-foreground">От 10 до 128 символов.</p>
        {registering ? (
          <label className="block">
            Ключ приглашения
            <input
              className={fieldControlClass}
              type="password"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              aria-describedby="invitation-hint"
              required
            />
            <span
              id="invitation-hint"
              className="mt-2 block text-xs text-muted-foreground"
            >
              Получите одноразовый ключ у оператора Litora. Без него регистрация
              недоступна.
            </span>
          </label>
        ) : null}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={pending} className="w-full">
          {pending
            ? "Подождите…"
            : registering
              ? "Зарегистрироваться"
              : "Войти"}
        </Button>
        <Button
          type="button"
          disabled={pending}
          variant="link"
          className="w-full"
          onClick={() => {
            setRegistering((value) => !value);
            setInvitationCode("");
            setError("");
          }}
        >
          {registering
            ? "Уже есть аккаунт? Войти"
            : "Нет аккаунта? Зарегистрироваться"}
        </Button>
      </form>
    </section>
  );
}
