import { useCallback, useEffect, useState } from "react";
import type {
  CalculationJobDto,
  CalculationKindDto,
  CalculationPageDto,
  CalculationPageQueryDto,
} from "@litora/contracts";
import { api } from "@/shared/api/client";

export function isActiveCalculation(job: CalculationJobDto) {
  return job.status === "queued" || job.status === "running";
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось получить данные";
}

export function useCalculationKinds() {
  const [kinds, setKinds] = useState<CalculationKindDto[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    void api
      .calculationKinds()
      .then((result) => {
        if (!mounted) return;
        setKinds(result);
        setError("");
      })
      .catch((nextError: unknown) => {
        if (mounted) setError(messageFromError(nextError));
      });
    return () => {
      mounted = false;
    };
  }, [revision]);

  return { kinds, error, reload };
}

export function useCalculations() {
  const [jobs, setJobs] = useState<CalculationJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const result = await api.calculations();
        if (mounted) {
          setJobs(result);
          setError("");
        }
      } catch (nextError) {
        if (mounted) setError(messageFromError(nextError));
      } finally {
        if (mounted) {
          setLoading(false);
          timer = setTimeout(poll, 4000);
        }
      }
    }

    void poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [revision]);

  return { jobs, loading, error, reload };
}

export function useCalculationPage(search: string) {
  const [state, setState] = useState<{
    key: string;
    page?: CalculationPageDto;
    error: string;
  }>({ key: "", error: "" });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const key = JSON.stringify([search, revision]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const params = new URLSearchParams(search);
    const query: CalculationPageQueryDto = {
      status: (params.get("status") ||
        undefined) as CalculationPageQueryDto["status"],
      kind: (params.get("kind") ||
        undefined) as CalculationPageQueryDto["kind"],
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      jobId: params.get("jobId") || undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
      cursor: params.get("cursor") || undefined,
    };
    async function poll() {
      try {
        const result = await api.calculationPage(query);
        if (mounted) setState({ key, page: result, error: "" });
      } catch (nextError) {
        if (mounted)
          setState((current) => ({
            key,
            page: current.key === key ? current.page : undefined,
            error: messageFromError(nextError),
          }));
      } finally {
        if (mounted) {
          timer = setTimeout(poll, 4000);
        }
      }
    }
    void poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [search, revision, key]);

  return {
    page: state.key === key ? state.page : undefined,
    loading: state.key !== key,
    error: state.key === key ? state.error : "",
    reload,
  };
}

export function useCalculation(jobId: string) {
  const [state, setState] = useState<{
    jobId: string;
    job?: CalculationJobDto;
    error: string;
  }>({ jobId: "", error: "" });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      let delay = 4000;
      try {
        const result = await api.calculation(jobId);
        if (mounted) {
          setState({ jobId, job: result, error: "" });
          delay = isActiveCalculation(result) ? 2000 : 600000;
        }
      } catch (nextError) {
        if (mounted)
          setState((current) => ({
            jobId,
            job: current.jobId === jobId ? current.job : undefined,
            error: messageFromError(nextError),
          }));
      } finally {
        if (mounted) {
          timer = setTimeout(poll, delay);
        }
      }
    }

    void poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, revision]);

  return {
    job: state.jobId === jobId ? state.job : undefined,
    loading: state.jobId !== jobId,
    error: state.jobId === jobId ? state.error : "",
    reload,
  };
}

export function errorMessage(error: unknown) {
  return messageFromError(error);
}
