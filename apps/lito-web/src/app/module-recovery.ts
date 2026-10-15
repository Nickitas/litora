const recoveryKey = "litora:module-reload:v1";
const recoveryWindowMs = 60_000;

export function isModuleLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script/i.test(
    error.message
  );
}

export function canRecoverModule(): boolean {
  if (navigator.onLine === false) return false;

  try {
    const lastAttempt = Number(sessionStorage.getItem(recoveryKey));
    return Date.now() - lastAttempt >= recoveryWindowMs;
  } catch {
    // Без доступного sessionStorage нельзя защититься от цикла перезагрузок.
    return false;
  }
}

export function recoverModule(): boolean {
  if (!canRecoverModule()) return false;

  try {
    sessionStorage.setItem(recoveryKey, String(Date.now()));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}

export function registerModuleRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (recoverModule()) event.preventDefault();
  });
}
