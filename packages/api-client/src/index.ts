import type {
  AuthDto,
  CalculationJobDto,
  CalculationDeletionOverviewDto,
  CalculationDeletionRequestDto,
  CalculationKindDto,
  CalculationPageDto,
  CalculationPageQueryDto,
  CreateCalculationDto,
  CreateDatasetDto,
  CreateScientificInputDto,
  DatasetDto,
  HealthDto,
  LoginDto,
  RegisterDto,
  ReleaseDto,
  ReusableScientificArtifactDto,
  ScientificInputDto,
  ObservedShorelineSeriesDto,
  ShorelinePointSeriesDto,
  ShorelineVisualizationChunkDto,
  ShorelineVisualizationIndexDto,
  UserDto,
} from "@litora/contracts";

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

type AuthChange =
  | { type: "session"; session: AuthDto }
  | { type: "ended"; reason: "expired" | "logout" };

/** Ошибка ответа API с HTTP-статусом для различения завершения сессии и временных сбоев. */
export class ApiResponseError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function responseError(response: Response, fallback: string) {
  const error = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  return new ApiResponseError(
    Array.isArray(error.message)
      ? error.message.join(". ")
      : (error.message ?? fallback),
    response.status,
  );
}

function isAuthDto(value: unknown): value is AuthDto {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthDto>;
  return (
    typeof session.accessToken === "string" &&
    session.accessToken.length > 0 &&
    typeof session.expiresIn === "number" &&
    Number.isFinite(session.expiresIn) &&
    session.expiresIn > 0 &&
    !!session.user &&
    typeof session.user.id === "string" &&
    typeof session.user.email === "string" &&
    typeof session.user.name === "string"
  );
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const request = options.fetch ?? globalThis.fetch;
  let accessToken: string | undefined;
  let accessExpiresAt = 0;
  let currentSession: AuthDto | undefined;
  let sessionVersion = 0;
  let refreshing: Promise<AuthDto> | undefined;
  const authListeners = new Set<(change: AuthChange) => void>();
  const channel =
    typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(`litora-auth:${baseUrl}`)
      : undefined;

  function notify(change: AuthChange) {
    for (const listener of authListeners) listener(change);
  }

  function acceptSession(session: AuthDto, broadcast = true) {
    currentSession = session;
    accessToken = session.accessToken;
    accessExpiresAt = Date.now() + session.expiresIn * 1000;
    sessionVersion += 1;
    notify({ type: "session", session });
    if (broadcast) channel?.postMessage({ type: "session", session });
  }

  function endSession(reason: "expired" | "logout", broadcast = true) {
    currentSession = undefined;
    accessToken = undefined;
    accessExpiresAt = 0;
    sessionVersion += 1;
    notify({ type: "ended", reason });
    if (broadcast) channel?.postMessage({ type: "ended", reason });
  }

  channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const message = data as Record<string, unknown>;
    if (message.type === "session") {
      if (isAuthDto(message.session)) acceptSession(message.session, false);
    } else if (
      message.type === "ended" &&
      (message.reason === "logout" || message.reason === "expired")
    ) {
      endSession(message.reason, false);
    }
  });

  async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(`litora-auth-refresh:${baseUrl}`, task);
    return task();
  }

  function isSessionRequest(path: string) {
    return [
      "/auth/login",
      "/auth/register",
      "/auth/refresh",
      "/auth/logout",
    ].includes(path);
  }

  function isPublicRequest(path: string) {
    return path === "/health" || path === "/releases/latest";
  }

  async function ensureFreshToken(path: string) {
    if (
      !isSessionRequest(path) &&
      !isPublicRequest(path) &&
      accessToken &&
      accessExpiresAt <= Date.now() + 30_000
    )
      await refresh(accessToken);
  }

  async function send<T>(
    path: string,
    method = "GET",
    body?: unknown,
    attempts = 0,
  ): Promise<T> {
    await ensureFreshToken(path);
    const sentToken = accessToken;
    const response = await request(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => {
      throw new Error(
        "Нет связи с сервером. Проверьте подключение и повторите попытку.",
      );
    });
    if (
      response.status === 401 &&
      !isSessionRequest(path) &&
      !isPublicRequest(path)
    ) {
      if (attempts < 3) {
        if (!accessToken || sentToken === accessToken) await refresh(sentToken);
        return send<T>(path, method, body, attempts + 1);
      }
      throw new Error("Не удалось подтвердить доступ. Повторите попытку.");
    }
    if (!response.ok)
      throw await responseError(response, `Ошибка API: ${response.status}`);
    return response.json() as Promise<T>;
  }
  async function session(path: string, body?: unknown) {
    const result = await send<AuthDto>(path, "POST", body);
    if (!isAuthDto(result))
      throw new Error("Некорректный ответ сервера при проверке сессии");
    acceptSession(result);
    return result;
  }
  async function sendBinary<T>(
    path: string,
    body: Blob,
    attempts = 0,
  ): Promise<T> {
    await ensureFreshToken(path);
    const sentToken = accessToken;
    const response = await request(`${baseUrl}${path}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
      },
      body,
    }).catch(() => {
      throw new Error(
        "Не удалось передать файл. Проверьте подключение и повторите попытку.",
      );
    });
    if (response.status === 401) {
      if (attempts < 3) {
        if (!accessToken || sentToken === accessToken) await refresh(sentToken);
        return sendBinary<T>(path, body, attempts + 1);
      }
      throw new Error("Не удалось подтвердить доступ. Повторите загрузку.");
    }
    if (!response.ok)
      throw await responseError(
        response,
        `Ошибка загрузки: ${response.status}`,
      );
    return response.json() as Promise<T>;
  }
  function refresh(staleToken?: string) {
    if (staleToken && currentSession && accessToken !== staleToken)
      return Promise.resolve(currentSession);
    if (!refreshing) {
      const initialVersion = sessionVersion;
      refreshing = withRefreshLock(async () => {
        if (sessionVersion !== initialVersion && currentSession)
          return currentSession;
        try {
          return await session("/auth/refresh");
        } catch (error) {
          if (error instanceof ApiResponseError && error.status === 401) {
            // Другой вкладке могла достаться ротация cookie до ответа с 401.
            if (currentSession && sessionVersion !== initialVersion)
              return currentSession;
            if (currentSession) {
              await new Promise((resolve) => setTimeout(resolve, 150));
              if (sessionVersion !== initialVersion && currentSession)
                return currentSession;
              try {
                return await session("/auth/refresh");
              } catch (retryError) {
                if (
                  !(retryError instanceof ApiResponseError) ||
                  retryError.status !== 401
                )
                  throw retryError;
              }
            }
            endSession("expired");
          }
          throw error;
        }
      }).finally(() => {
        refreshing = undefined;
      });
    }
    return refreshing;
  }
  return {
    health: () => send<HealthDto>("/health"),
    releases: () => send<ReleaseDto>("/releases/latest"),
    login: (body: LoginDto) => session("/auth/login", body),
    register: (body: RegisterDto) => session("/auth/register", body),
    refresh: () => refresh(),
    onAuthChange: (listener: (change: AuthChange) => void) => {
      authListeners.add(listener);
      return () => {
        authListeners.delete(listener);
      };
    },
    me: () => send<UserDto>("/auth/me"),
    logout: async () => {
      if (refreshing) await refreshing.catch(() => undefined);
      await withRefreshLock(async () => {
        await send("/auth/logout", "POST");
        endSession("logout");
      });
    },
    calculationKinds: () => send<CalculationKindDto[]>("/calculations/kinds"),
    datasets: () => send<DatasetDto[]>("/datasets"),
    createDataset: (body: CreateDatasetDto) =>
      send<DatasetDto>("/datasets", "POST", body),
    scientificInputs: () => send<ScientificInputDto[]>("/scientific-inputs"),
    shorelineObservationSeries: (id: string) =>
      send<ObservedShorelineSeriesDto>(
        `/scientific-inputs/${encodeURIComponent(id)}/shoreline-series`,
      ),
    reusableScientificArtifacts: () =>
      send<ReusableScientificArtifactDto[]>("/scientific-inputs/reusable-artifacts"),
    createScientificInput: (body: CreateScientificInputDto) =>
      send<ScientificInputDto>("/scientific-inputs", "POST", body),
    uploadScientificInput: (id: string, file: Blob) =>
      sendBinary<ScientificInputDto>(
        `/scientific-inputs/${encodeURIComponent(id)}/content`,
        file,
      ),
    deletePendingScientificInput: (id: string) =>
      send<{ deleted: boolean }>(`/scientific-inputs/${encodeURIComponent(id)}`, "DELETE"),
    createCalculation: (body: CreateCalculationDto) =>
      send<CalculationJobDto>("/calculations", "POST", body),
    calculations: () => send<CalculationJobDto[]>("/calculations"),
    calculationPage: (query: CalculationPageQueryDto = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      const suffix = params.size ? `?${params.toString()}` : "";
      return send<CalculationPageDto>(`/calculations/page${suffix}`);
    },
    calculation: (id: string) =>
      send<CalculationJobDto>(`/calculations/${encodeURIComponent(id)}`),
    shorelineVisualization: (id: string) =>
      send<ShorelineVisualizationIndexDto>(
        `/calculations/${encodeURIComponent(id)}/visualization`,
      ),
    shorelineVisualizationChunk: (id: string, chunkId: string) =>
      send<ShorelineVisualizationChunkDto>(
        `/calculations/${encodeURIComponent(id)}/visualization/chunks/${encodeURIComponent(chunkId)}`,
      ),
    shorelinePointSeries: (id: string, pointIndex: number) =>
      send<ShorelinePointSeriesDto>(
        `/calculations/${encodeURIComponent(id)}/visualization/points/${pointIndex}/series`,
      ),
    cancelCalculation: (id: string) =>
      send<CalculationJobDto>(
        `/calculations/${encodeURIComponent(id)}/cancel`,
        "POST",
      ),
    calculationDeletionOverview: () =>
      send<CalculationDeletionOverviewDto>("/calculations/deletion-overview"),
    calculationDeletionRequest: (id: string) =>
      send<CalculationDeletionRequestDto>(
        `/calculations/deletions/${encodeURIComponent(id)}`,
      ),
    currentCalculationDeletionRequest: () =>
      send<CalculationDeletionRequestDto | null>("/calculations/deletions-current"),
    deleteCalculation: (id: string) =>
      send<CalculationDeletionRequestDto>(
        `/calculations/${encodeURIComponent(id)}`, "DELETE",
      ),
    deleteAllCalculations: () =>
      send<CalculationDeletionRequestDto>("/calculations", "DELETE"),
  };
}

export type LitoApiClient = ReturnType<typeof createApiClient>;
