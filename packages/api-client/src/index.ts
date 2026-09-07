import type { CalculationJobDto, HealthDto, ReleaseDto } from "@litora/contracts";

export interface ApiClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch; }

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const request = options.fetch ?? globalThis.fetch;
  async function get<T>(path: string): Promise<T> {
    const response = await request(`${baseUrl}${path}`);
    if (!response.ok) throw new Error(`Lito API request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }
  return {
    health: () => get<HealthDto>("/health"),
    releases: () => get<ReleaseDto>("/releases/latest"),
    calculations: () => get<CalculationJobDto[]>("/calculations"),
    calculation: (id: string) => get<CalculationJobDto>(`/calculations/${encodeURIComponent(id)}`),
  };
}

export type LitoApiClient = ReturnType<typeof createApiClient>;
