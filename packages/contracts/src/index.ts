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

export interface ShorelineVisualizationFrameDto {
  index: number;
  time: string | null;
  chunkId: string;
  durationHours: number | null;
  waveHeightM: number | null;
  erodedVolumeM3: number | null;
  depositedVolumeM3: number | null;
  balanceClosureResidualM3: number | null;
}

export interface ShorelineVisualizationIndexDto {
  schemaVersion: 1;
  mode: "calendar" | "steps";
  scenarioStatus: string;
  usageLimitations: string[];
  waveSource: string;
  bathymetrySha256: string;
  bathymetryStatus: string;
  crs: "EPSG:4326";
  coordinateUnit: "degrees";
  bounds: [number, number, number, number];
  pointCount: number;
  pointSeries?: { groupSize: 10 };
  frames: ShorelineVisualizationFrameDto[];
}

export interface ShorelinePointSeriesDto {
  schemaVersion: 1;
  pointIndex: number;
  shorelineChangeM: (number | null)[];
}

export interface ShorelineVisualizationChunkDto {
  schemaVersion: 1;
  id: string;
  frames: {
    index: number;
    points: { lat: number; lon: number }[];
    cells: { pointIndex: number; shorelineChangeM: number }[];
  }[];
}

/** Заявленный источником метод поправки уровня воды для одного контура. */
export interface WaterLevelCorrectionDto {
  method: string;
  source: string;
  verticalDatum: string;
}

/** Датированные наблюдения берега из проверенного GeoJSON в EPSG:4326. */
export interface ObservedShorelineSeriesDto {
  schemaVersion: 1;
  bounds: [number, number, number, number];
  frames: {
    time: string;
    satellite: string;
    geoAccuracy: number | null;
    cloudCover: number | null;
    uncertaintyM?: number | null;
    tideCorrected?: boolean | null;
    waterLevelCorrection?: WaterLevelCorrectionDto | null;
    coordinates: [number, number][];
  }[];
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
  deletionRequestedAt?: string | null;
  artifacts: CalculationArtifactDto[];
}

export interface CalculationDeletionOverviewDto {
  totalCount: number;
  activeCount: number;
  settlingCount: number;
  deletingCount: number;
}

export interface CalculationDeletionRequestDto {
  id: string;
  scope: "single" | "all";
  requestedCount: number;
  deletedCount: number;
  retryingCount: number;
  status: "pending" | "retrying" | "completed";
  createdAt: string;
}

export interface CalculationMetadataExportV1 {
  format: "litora.calculation-metadata";
  schemaVersion: 1;
  calculation: {
    id: string;
    kind: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    input: Record<string, string | number | boolean> | null;
    inputSchemaVersion: number | null;
    resultSchemaVersion: number | null;
    coreVersion: string | null;
    methodId: string | null;
    methodRevision: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
  };
  provenance: {
    dataset: {
      id: string;
      schemaVersion: number | null;
      source: string | null;
      sourceRevision: string | null;
      license: string | null;
      crs: string | null;
      coordinateUnit: string | null;
      pointCount: number | null;
      sha256: string | null;
    } | null;
    declaredSources: {
      generatedAt: string | null;
      coastline: string | null;
      waves: string | null;
      bathymetry: string | null;
      structures: string | null;
      structuresWarning: string | null;
    } | null;
    inputFiles: {
      id?: string;
      role?: string;
      origin?: "upload" | "artifact";
      sourceJobId?: string;
      filename?: string;
      source?: string;
      license?: string;
      crs?: string;
      coordinateUnit?: string;
      sizeBytes: number | null;
      sha256: string | null;
    }[];
  } | null;
  artifacts: {
    id: string;
    category: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
  }[];
}

export interface CalculationPageQueryDto {
  status?: CalculationStatus;
  kind?: CalculationKind;
  visualization?: "shoreline";
  from?: string;
  to?: string;
  jobId?: string;
  limit?: number;
  cursor?: string;
}

export interface CalculationPageDto {
  items: CalculationJobDto[];
  nextCursor: string | null;
  totalCount: number;
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
  | "source_file"
  | "dimension"
  | "dimension_dataset"
  | "dimension_file"
  | "map"
  | "map_file"
  | "erosion"
  | "erosion_file"
  | "all_demo"
  | "all_file"
  | "calibrate_cerc"
  | "shoreline_data_audit"
  | "mesh"
  | "seabed_build"
  | "seabed_render"
  | "seabed_adapt"
  | "seabed_generate_adaptive"
  | "seabed_validate"
  | "seabed_compare_adaptive"
  | "seabed_assess_ml"
  | "seabed_check_full";
export interface CreateCalculationDto {
  kind: CalculationKind;
  input?: Record<string, string | number | boolean | undefined>;
}
export interface CalculationKindDto {
  kind: CalculationKind;
  title: string;
  description: string;
}

/** Управляемые параметры CERC; научный расчёт выполняет только Go. */
export interface CercOptionsDto {
  steps: number;
  /** Для собственных входов: 0 — все SVG при обычном расчёте. */
  svgMaxFrames?: number;
  breakingIndex: number;
  bermHeight: number;
  closureDepth: number;
  porosity: number;
  cercCoefficient: number;
  offshoreSampleDistance: number;
  maxShorelineChange: number;
  maxBathymetryGap: number;
  leftBoundaryTransport: number;
  rightBoundaryTransport: number;
  outputCsv: boolean;
  csvFormat: "long" | "wide";
  outputGif: boolean;
  gifFps: number;
  gifSkip: number;
}

/** Совместимое имя контракта демонстрационного сценария. */
export type ErosionDemoOptionsDto = CercOptionsDto;

export const erosionDemoDefaults: CercOptionsDto = {
  steps: 168,
  breakingIndex: 0.78,
  bermHeight: 2,
  closureDepth: 8,
  porosity: 0.4,
  cercCoefficient: 0.39,
  offshoreSampleDistance: 300,
  maxShorelineChange: 25,
  maxBathymetryGap: 3000,
  leftBoundaryTransport: 0,
  rightBoundaryTransport: 0,
  outputCsv: false,
  csvFormat: "long",
  outputGif: false,
  gifFps: 10,
  gifSkip: 1,
};

/** Параметры CERC для собственного контура, волнового ряда и батиметрии. */
export const erosionFileDefaults: CercOptionsDto = {
  ...erosionDemoDefaults,
  steps: 3,
  maxBathymetryGap: 1500,
  svgMaxFrames: 0,
};

/** Общие параметры полного конвейера CLI для демо и собственных входов. */
export interface AllOptionsDto extends CercOptionsDto {
  modelMaxPoints: number;
  noModelSimplify: boolean;
}

/** Совместимое имя контракта демонстрационного сценария. */
export type AllDemoOptionsDto = AllOptionsDto;

export const allDemoDefaults: AllOptionsDto = {
  ...erosionDemoDefaults,
  steps: 24,
  modelMaxPoints: 0,
  noModelSimplify: false,
};

/** Параметры полного конвейера по собственным проверяемым входным файлам. */
export const allFileDefaults: AllOptionsDto = {
  ...allDemoDefaults,
  steps: 3,
  maxBathymetryGap: 1500,
  svgMaxFrames: 0,
};

/** Ограниченные параметры физической калибровки; расчёт и научная проверка выполняются в Go. */
export interface CercCalibrationOptionsDto {
  bathymetryResolution: number;
  cercCoefficients: string;
  maxObservationDistance: number;
  minWaveHours: number;
  breakingIndex: number;
  bermHeight: number;
  closureDepth: number;
  porosity: number;
  offshoreSampleDistance: number;
  maxBathymetryGap: number;
  leftBoundaryTransport: number;
  rightBoundaryTransport: number;
}

export const cercCalibrationDefaults: Omit<CercCalibrationOptionsDto, "bathymetryResolution"> = {
  cercCoefficients: "0.2,0.3,0.39,0.5,0.6",
  maxObservationDistance: 500,
  minWaveHours: 8766,
  breakingIndex: 0.78,
  bermHeight: 2,
  closureDepth: 8,
  porosity: 0.4,
  offshoreSampleDistance: 300,
  maxBathymetryGap: 1500,
  leftBoundaryTransport: 0,
  rightBoundaryTransport: 0,
};

/** Дополнительный экспертный набор AI-01 для принятого сравнения ADAPT-03. */
export interface ExpertSetOptionsDto {
  generateExpertSet: boolean;
  expertLevels: string;
  expertSeed: string;
}

export const expertSetDefaults: ExpertSetOptionsDto = {
  generateExpertSet: false,
  expertLevels: "",
  expertSeed: "ai-01-black-sea-2026",
};

/** Компоновка рисунка 5 из трёх фактических карточек одного запуска AI-01. */
export interface FigureFiveOptionsDto {
  generateFigureFive: boolean;
  figureFiveLevel: string;
  figureFiveGenerator: "delaunay" | "frontal-quad" | "parallelograms";
}

export const figureFiveDefaults: FigureFiveOptionsDto = {
  generateFigureFive: false,
  figureFiveLevel: "",
  figureFiveGenerator: "delaunay",
};

/** Пороговые параметры проверки необходимости ML; математическая модель остаётся в Go. */
export interface AINecessityOptionsDto {
  minExpertsPerCard: number;
  minTraining: number;
  minEvaluation: number;
  ridgeLambda: number;
  minRmseImprovement: number;
}

export const aiNecessityDefaults: AINecessityOptionsDto = {
  minExpertsPerCard: 2,
  minTraining: 12,
  minEvaluation: 12,
  ridgeLambda: 1,
  minRmseImprovement: 0.1,
};

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

export type ScientificInputRole =
  | "coastline_geojson"
  | "shoreline_timeseries_geojson"
  | "wave_climate"
  | "shoreline_observations_json"
  | "longshore_sediment_sources_json"
  | "longshore_structures_json"
  | "flat_mesh_msh"
  | "seabed_msh"
  | "bathymetry_grid_json"
  | "bathymetry_grid_metadata_json"
  | "relief_reference_passport_json"
  | "export_metadata_json"
  | "bathymetry_source_json"
  | "adaptive_field_csv"
  | "adaptive_field_report_json"
  | "mesh_comparison_report_json"
  | "adaptive_comparison_report_json"
  | "expert_organizer_key_json"
  | "expert_ratings_tsv";

const ownCercInputRequirements = {
  coastlineInputId: "coastline_geojson",
  waveInputId: "wave_climate",
  bathymetryInputId: "bathymetry_grid_json",
  bathymetryMetadataInputId: "bathymetry_grid_metadata_json",
} as const;

export const scientificInputRequirements = {
  source_file: { coastlineInputId: "coastline_geojson" },
  dimension_file: { coastlineInputId: "coastline_geojson" },
  map_file: { coastlineInputId: "coastline_geojson" },
  mesh: { coastlineInputId: "coastline_geojson" },
  erosion_file: ownCercInputRequirements,
  all_file: ownCercInputRequirements,
  calibrate_cerc: {
    ...ownCercInputRequirements,
    observationsInputId: "shoreline_observations_json",
  },
  shoreline_data_audit: {
    observationsInputId: "shoreline_timeseries_geojson",
  },
  seabed_build: {
    flatMeshInputId: "flat_mesh_msh",
    bathymetryInputId: "bathymetry_grid_json",
    bathymetryMetadataInputId: "bathymetry_grid_metadata_json",
    coastlineInputId: "coastline_geojson",
  },
  seabed_render: {
    modelInputId: "seabed_msh",
    exportMetadataInputId: "export_metadata_json",
    sourceMetadataInputId: "bathymetry_source_json",
  },
  seabed_adapt: {
    modelInputId: "seabed_msh",
    sourceMetadataInputId: "bathymetry_source_json",
  },
  seabed_generate_adaptive: {
    modelInputId: "seabed_msh",
    exportMetadataInputId: "export_metadata_json",
    fieldCsvInputId: "adaptive_field_csv",
    fieldReportInputId: "adaptive_field_report_json",
    coastlineInputId: "coastline_geojson",
  },
  seabed_validate: {
    modelInputId: "seabed_msh",
    exportMetadataInputId: "export_metadata_json",
    referenceModelInputId: "seabed_msh",
    referenceMetadataInputId: "export_metadata_json",
    referencePassportInputId: "relief_reference_passport_json",
    fieldCsvInputId: "adaptive_field_csv",
    fieldReportInputId: "adaptive_field_report_json",
  },
  seabed_compare_adaptive: {
    modelInputId: "seabed_msh",
    exportMetadataInputId: "export_metadata_json",
    fieldCsvInputId: "adaptive_field_csv",
    fieldReportInputId: "adaptive_field_report_json",
    coastlineInputId: "coastline_geojson",
  },
  seabed_assess_ml: {
    ratingsInputId: "expert_ratings_tsv",
    organizerKeyInputId: "expert_organizer_key_json",
    comparisonReportInputId: "adaptive_comparison_report_json",
    modelInputId: "seabed_msh",
    exportMetadataInputId: "export_metadata_json",
    coastlineInputId: "coastline_geojson",
  },
  seabed_check_full: {
    flatMeshInputId: "flat_mesh_msh",
    meshReportInputId: "mesh_comparison_report_json",
    coastlineInputId: "coastline_geojson",
    bathymetryInputId: "bathymetry_grid_json",
    bathymetryMetadataInputId: "bathymetry_grid_metadata_json",
  },
} as const satisfies Partial<Record<CalculationKind, Record<string, ScientificInputRole>>>;

/** Необязательные индексные профили CERC, привязанные к нормализованному Go-контуру. */
export const optionalScientificInputRequirements = {
  erosion_file: {
    sedimentSourcesInputId: "longshore_sediment_sources_json",
    structuresInputId: "longshore_structures_json",
  },
  all_file: {
    sedimentSourcesInputId: "longshore_sediment_sources_json",
    structuresInputId: "longshore_structures_json",
  },
  calibrate_cerc: {
    sedimentSourcesInputId: "longshore_sediment_sources_json",
    structuresInputId: "longshore_structures_json",
  },
  shoreline_data_audit: {
    waveInputId: "wave_climate",
  },
} as const satisfies Partial<Record<CalculationKind, Record<string, ScientificInputRole>>>;

export interface CreateScientificInputDto {
  name: string;
  role: ScientificInputRole;
  filename: string;
  sizeBytes: number;
  source: string;
  sourceRevision?: string;
  license: string;
  crs: string;
  coordinateUnit: string;
}

export interface ScientificInputDto extends CreateScientificInputDto {
  id: string;
  status: "pending" | "uploading" | "ready";
  sha256: string | null;
  createdAt: string;
}

export interface ReusableScientificArtifactDto {
  id: string;
  jobId: string;
  jobKind: string;
  role: ScientificInputRole;
  filename: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}
