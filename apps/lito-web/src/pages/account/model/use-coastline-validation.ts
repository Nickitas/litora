import { useEffect, useRef, useState } from "react";
import type { CoastlineValidationDto } from "@litora/contracts";
import { api } from "@/shared/api/client";

export type CoastlineSourceType = "dataset" | "scientific";
export const validationPending = (
  state: CoastlineValidationDto | undefined | null,
) => state?.status === "queued" || state?.status === "running";
export const validationPassed = (
  state: CoastlineValidationDto | undefined | null,
) => state?.status === "succeeded" && state.accepted === true;

export function validationTitle(
  state: CoastlineValidationDto | undefined | null,
) {
  if (!state) return "Состояние проверки ещё не получено";
  if (state.status === "queued") return "Проверка геометрии в очереди";
  if (state.status === "running") return "Go проверяет геометрию";
  if (validationPassed(state))
    return state.issues.length
      ? "Геометрия проверена, есть предупреждения"
      : "Проверка геометрии пройдена";
  if (state.status === "cancelled") return "Проверка отменена";
  if (state.status === "failed") return "Проверка геометрии не пройдена";
  if (state.status === "succeeded") return "Нужна новая проверка геометрии";
  return "Геометрия ещё не проверена";
}

export function useCoastlineValidation(
  type: CoastlineSourceType,
  id: string,
  initial?: CoastlineValidationDto,
) {
  const key = `${type}:${id}`;
  const initialMessage = initial?.message;
  const [stored, setStored] = useState<{
    key: string;
    value: CoastlineValidationDto;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [requestingFor, setRequestingFor] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const result = await (type === "dataset"
          ? api.datasetValidation(id)
          : api.scientificCoastlineValidation(id));
        if (generation.current !== current) return;
        setStored((previous) => ({
          key,
          value:
            result.status === "not_requested" && !result.message
              ? {
                  ...result,
                  message:
                    previous?.key === key
                      ? previous.value.message
                      : (initialMessage ?? null),
                }
              : result,
        }));
        setFailure(null);
        if (validationPending(result))
          timer = setTimeout(() => void read(), 2000);
      } catch (error) {
        if (generation.current === current)
          setFailure({
            key,
            message:
              error instanceof Error
                ? error.message
                : "Не удалось получить проверку",
          });
      }
    };
    if (id) void read();
    return () => {
      generation.current += 1;
      clearTimeout(timer);
    };
  }, [id, type, key, revision, initialMessage]);

  async function start() {
    if (!id || requestingFor === key) return;
    const current = generation.current;
    setRequestingFor(key);
    try {
      const result = await (type === "dataset"
        ? api.validateDataset(id)
        : api.validateScientificCoastline(id));
      if (current !== generation.current) return;
      setStored({ key, value: result });
      setFailure(null);
      setRevision((value) => value + 1);
    } catch (error) {
      if (current === generation.current)
        setFailure({
          key,
          message:
            error instanceof Error
              ? error.message
              : "Не удалось запустить проверку",
        });
    } finally {
      setRequestingFor((currentKey) => (currentKey === key ? "" : currentKey));
    }
  }

  return {
    state: stored?.key === key ? stored.value : (initial ?? null),
    error: failure?.key === key ? failure.message : "",
    requesting: requestingFor === key,
    refresh: () => {
      setFailure(null);
      setRevision((value) => value + 1);
    },
    start,
  };
}

/** Ожидает проверку перед явно запрошенным запуском встроенного набора. */
export async function awaitDatasetValidation(
  id: string,
  signal: AbortSignal,
  update: (value: CoastlineValidationDto) => void,
) {
  const stopped = () => {
    if (signal.aborted) throw new Error("Запуск отменён");
  };
  let state = await api.datasetValidation(id);
  stopped();
  if (state.status === "not_requested") state = await api.validateDataset(id);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    stopped();
    update(state);
    if (validationPassed(state)) return;
    if (!validationPending(state))
      throw new Error(
        state.message ??
          state.issues[0]?.message ??
          "Геометрия не прошла проверку Go. Откройте набор и проверьте замечания.",
      );
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        clearTimeout(timer);
        reject(new Error("Запуск отменён"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, 2000);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    stopped();
    state = await api.datasetValidation(id);
  }
  throw new Error(
    "Проверка ещё продолжается. Набор сохранён; запустите расчёт после её завершения.",
  );
}
