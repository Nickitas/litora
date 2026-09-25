import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../model";

export function LoginForm() {
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      if (registering) await auth.register({ name, email, password });
      else await auth.login({ email, password });
      navigate("/account");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }
  const field = "mt-2 w-full rounded-lg border bg-background p-3";
  return (
    <section className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm">
      <h1 className="text-2xl font-bold">
        {registering ? "Создать аккаунт" : "Войти в Litora"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Запускайте расчёты и храните отчёты в личном кабинете.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {registering && (
          <label className="block">
            Имя
            <input
              className={field}
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
            className={field}
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
            className={field}
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
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          disabled={pending}
          className="w-full rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
        >
          {pending
            ? "Подождите…"
            : registering
              ? "Зарегистрироваться"
              : "Войти"}
        </button>
        <button
          type="button"
          disabled={pending}
          className="w-full text-sm underline"
          onClick={() => {
            setRegistering((value) => !value);
            setError("");
          }}
        >
          {registering
            ? "Уже есть аккаунт? Войти"
            : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </form>
    </section>
  );
}
