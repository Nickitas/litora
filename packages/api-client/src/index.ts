import type {
  AuthDto,
  CalculationJobDto,
  CalculationKindDto,
  CalculationPageDto,
  CalculationPageQueryDto,
  CreateCalculationDto,
  CreateDatasetDto,
  DatasetDto,
  HealthDto,
  LoginDto,
  RegisterDto,
  ReleaseDto,
  UserDto,
} from "@litora/contracts";

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const request = options.fetch ?? globalThis.fetch;
  let accessToken: string | undefined;
  let refreshing: Promise<AuthDto> | undefined;
  async function send<T>(
    path: string,
    method = "GET",
    body?: unknown,
    retry = true,
  ): Promise<T> {
    const response = await request(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => {
      throw new Error(
        "Нет связи с сервером. Проверьте подключение и повторите попытку.",
      );
    });
    if (response.status === 401 && retry && !path.startsWith("/auth/")) {
      await refresh();
      return send<T>(path, method, body, false);
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      throw new Error(
        Array.isArray(error.message)
          ? error.message.join(". ")
          : (error.message ?? `Ошибка API: ${response.status}`),
      );
    }
    return response.json() as Promise<T>;
  }
  async function session(path: string, body?: unknown) {
    const result = await send<AuthDto>(path, "POST", body);
    accessToken = result.accessToken;
    return result;
  }
  function refresh() {
    if (!refreshing)
      refreshing = session("/auth/refresh")
        .catch((error) => {
          accessToken = undefined;
          throw error;
        })
        .finally(() => {
          refreshing = undefined;
        });
    return refreshing;
  }
  return {
    health: () => send<HealthDto>("/health"),
    releases: () => send<ReleaseDto>("/releases/latest"),
    login: (body: LoginDto) => session("/auth/login", body),
    register: (body: RegisterDto) => session("/auth/register", body),
    refresh,
    me: () => send<UserDto>("/auth/me"),
    logout: async () => {
      await send("/auth/logout", "POST");
      accessToken = undefined;
    },
    calculationKinds: () => send<CalculationKindDto[]>("/calculations/kinds"),
    datasets: () => send<DatasetDto[]>("/datasets"),
    createDataset: (body: CreateDatasetDto) =>
      send<DatasetDto>("/datasets", "POST", body),
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
    cancelCalculation: (id: string) =>
      send<CalculationJobDto>(
        `/calculations/${encodeURIComponent(id)}/cancel`,
        "POST",
      ),
  };
}

export type LitoApiClient = ReturnType<typeof createApiClient>;
