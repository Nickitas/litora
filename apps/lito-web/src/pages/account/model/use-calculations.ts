import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CalculationJobDto,
  CalculationKindDto,
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

type HistoryState = {
  key: string;
  jobs: CalculationJobDto[];
  nextCursor: string | null;
  totalCount: number | null;
  loadingMore: boolean;
  error: string;
  loadMoreError: string;
};

function pageQuery(search: string): CalculationPageQueryDto {
  const params = new URLSearchParams(search);
  return {
    status: (params.get("status") ||
      undefined) as CalculationPageQueryDto["status"],
    kind: (params.get("kind") || undefined) as CalculationPageQueryDto["kind"],
    visualization: (params.get("visualization") ||
      undefined) as CalculationPageQueryDto["visualization"],
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    jobId: params.get("jobId") || undefined,
    limit: params.has("limit") ? Number(params.get("limit")) : undefined,
    cursor: params.get("cursor") || undefined,
  };
}

function mergeFirstPage(
  previous: CalculationJobDto[],
  firstPage: CalculationJobDto[]
) {
  const refreshedIds = new Set(firstPage.map((job) => job.id));
  return [...firstPage, ...previous.filter((job) => !refreshedIds.has(job.id))];
}

export function useInfiniteCalculationHistory(search: string) {
  const [state, setState] = useState<HistoryState>({
    key: "",
    jobs: [],
    nextCursor: null,
    totalCount: null,
    loadingMore: false,
    error: "",
    loadMoreError: "",
  });
  const [revision, setRevision] = useState(0);
  const loadingCursorRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const query = pageQuery(search);
    async function poll() {
      try {
        const result = await api.calculationPage(query);
        if (mounted)
          setState((current) => {
            // При уменьшении числа записей прежние страницы могут содержать
            // уже удалённый job. Перечитываем историю с первой страницы.
            const historyShrank = current.key === search && current.totalCount !== null &&
              result.totalCount < current.totalCount;
            if (current.key !== search || historyShrank)
              return {
                key: search,
                jobs: result.items,
                nextCursor: result.nextCursor,
                totalCount: result.totalCount,
                loadingMore: false,
                error: "",
                loadMoreError: "",
              };
            return {
              ...current,
              jobs: mergeFirstPage(current.jobs, result.items),
              nextCursor: current.totalCount === null ? result.nextCursor : current.nextCursor,
              totalCount: result.totalCount,
              error: "",
            };
          });
      } catch (nextError) {
        if (mounted)
          setState((current) => ({
            key: search,
            jobs: current.key === search ? current.jobs : [],
            nextCursor: current.key === search ? current.nextCursor : null,
            totalCount: current.key === search ? current.totalCount : null,
            loadingMore: current.key === search && current.loadingMore,
            error: messageFromError(nextError),
            loadMoreError: current.key === search ? current.loadMoreError : "",
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
  }, [search, revision]);

  const loadMore = useCallback(async () => {
    if (state.key !== search || state.loadingMore || !state.nextCursor) return;
    const cursor = state.nextCursor;
    const requestKey = `${search}\u0000${cursor}`;
    if (loadingCursorRef.current === requestKey) return;
    loadingCursorRef.current = requestKey;
    setState((current) =>
      current.key === search && current.nextCursor === cursor
        ? { ...current, loadingMore: true, loadMoreError: "" }
        : current
    );

    try {
      const result = await api.calculationPage({
        ...pageQuery(search),
        cursor,
      });
      if (!aliveRef.current) return;
      setState((current) => {
        if (current.key !== search || current.nextCursor !== cursor)
          return current;
        const knownIds = new Set(current.jobs.map((job) => job.id));
        return {
          ...current,
          jobs: [
            ...current.jobs,
            ...result.items.filter((job) => !knownIds.has(job.id)),
          ],
          nextCursor: result.nextCursor === cursor ? null : result.nextCursor,
          totalCount: result.totalCount,
          loadingMore: false,
          loadMoreError: "",
        };
      });
    } catch (nextError) {
      if (!aliveRef.current) return;
      setState((current) =>
        current.key === search && current.nextCursor === cursor
          ? {
              ...current,
              loadingMore: false,
              loadMoreError: messageFromError(nextError),
            }
          : current
      );
    } finally {
      if (loadingCursorRef.current === requestKey)
        loadingCursorRef.current = null;
    }
  }, [search, state.key, state.loadingMore, state.nextCursor]);

  const updateJob = useCallback(
    (job: CalculationJobDto) => {
      const requestedStatus = pageQuery(search).status;
      setState((current) => {
        if (
          current.key !== search ||
          !current.jobs.some((item) => item.id === job.id)
        )
          return current;
        const leavesFilter = Boolean(
          requestedStatus && requestedStatus !== job.status
        );
        return {
          ...current,
          jobs: leavesFilter
            ? current.jobs.filter((item) => item.id !== job.id)
            : current.jobs.map((item) => (item.id === job.id ? job : item)),
          totalCount:
            leavesFilter && current.totalCount !== null
              ? Math.max(0, current.totalCount - 1)
              : current.totalCount,
        };
      });
    },
    [search]
  );

  return {
    jobs: state.key === search ? state.jobs : [],
    nextCursor: state.key === search ? state.nextCursor : null,
    totalCount: state.key === search ? state.totalCount : null,
    loading: state.key !== search,
    loadingMore: state.key === search && state.loadingMore,
    error: state.key === search ? state.error : "",
    loadMoreError: state.key === search ? state.loadMoreError : "",
    loadMore,
    updateJob,
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
