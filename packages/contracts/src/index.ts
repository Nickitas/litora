export type Platform = "windows" | "macos" | "linux";

export interface ReleaseFile {
  id: string;
  name: string;
  platform: Platform;
  version: string;
  size: string;
  url: string;
  sha256: string;
}

export interface ReleaseDto {
  version: string;
  releaseDate: string;
  changelog: string[];
  files: ReleaseFile[];
}

export interface HealthDto {
  status: "ok";
  service: "lito-api";
  version: string;
}

export type CalculationStatus =
  "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface CalculationArtifactDto {
  id: string;
  category: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  downloadUrl: string;
}

export interface CalculationJobDto {
  id: string;
  kind: string;
  status: CalculationStatus;
  input: Record<string, unknown>;
  inputSchemaVersion: number | null;
  resultSummary: Record<string, unknown> | null;
  resultSchemaVersion: number | null;
  coreVersion: string | null;
  methodId: string | null;
  methodRevision: string | null;
  commandLine: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  artifacts: CalculationArtifactDto[];
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
}
export interface LoginDto {
  email: string;
  password: string;
}
export interface RegisterDto extends LoginDto {
  name: string;
  invitationCode: string;
}
export interface AuthDto {
  user: UserDto;
  accessToken: string;
  expiresIn: number;
}
export type CalculationKind =
  "dimension" | "dimension_dataset" | "map" | "erosion";
export interface CreateCalculationDto {
  kind: CalculationKind;
  input?: { steps?: number; datasetId?: string };
}
export interface CalculationKindDto {
  kind: CalculationKind;
  title: string;
  description: string;
}

export interface GeoJsonLineStringDto {
  type: "LineString";
  coordinates: [number, number][];
}

export interface CreateDatasetDto {
  name: string;
  source: string;
  sourceRevision?: string;
  license: string;
  crs: "EPSG:4326";
  coordinateUnit: "degrees";
  geometry: GeoJsonLineStringDto;
}

export interface DatasetDto {
  id: string;
  schemaVersion: number;
  name: string;
  source: string;
  sourceRevision: string | null;
  license: string;
  crs: "EPSG:4326";
  coordinateUnit: "degrees";
  pointCount: number;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}
