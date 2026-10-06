import type {
  CalculationJobDto,
  CalculationMetadataExportV1,
} from "@litora/contracts";
import { scientificInputRequirements } from "@litora/contracts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function countOrNull(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function sha256OrNull(value: unknown) {
  return typeof value === "string" && sha256Pattern.test(value) ? value : null;
}

function knownInput(job: CalculationJobDto) {
  if (!isRecord(job.input)) return null;
  if (job.kind === "dimension" || job.kind === "map") return {};
  if (job.kind === "erosion") {
    const steps = countOrNull(job.input.steps);
    if (steps === null || steps === 0) return null;
    const input: Record<string, string | number | boolean> = { steps };
    for (const key of [
      "breakingIndex", "bermHeight", "closureDepth", "porosity",
      "cercCoefficient", "offshoreSampleDistance", "maxShorelineChange",
      "maxBathymetryGap",
    ]) {
      const value = job.input[key];
      if (typeof value === "number" && Number.isFinite(value)) input[key] = value;
    }
    if (typeof job.input.outputCsv === "boolean") input.outputCsv = job.input.outputCsv;
    if (job.input.csvFormat === "long" || job.input.csvFormat === "wide") {
      input.csvFormat = job.input.csvFormat;
    }
    return input;
  }
  if (job.kind === "dimension_dataset") {
    const datasetId = job.input.datasetId;
    return typeof datasetId === "string" && uuidPattern.test(datasetId)
      ? { datasetId }
      : null;
  }
  const fields = scientificInputRequirements[job.kind as keyof typeof scientificInputRequirements];
  if (fields) {
    const input: Record<string, string | number | boolean> = {};
    for (const key of Object.keys(fields)) {
      const id = job.input[key];
      if (typeof id !== "string" || !uuidPattern.test(id)) return null;
      input[key] = id;
    }
    const allowedParameters: Record<string, string[]> = {
      source_file: [],
      dimension_file: [],
      map_file: [],
      mesh: ["cellSizes", "boundaryDetails", "generators", "maxCells", "allowLarge", "generatorTimeoutMinutes"],
      seabed_build: [
        "boundaryDetail", "maxSourceDistance", "coastTransition", "recoverWgs84",
        "maxNodes", "maxCells", "maxOutputMiB", "allowLarge",
      ],
      seabed_render: ["isobaths", "verticalExaggeration", "controlPoints"],
      seabed_adapt: [
        "minSize", "coastSize", "shelfSize", "deepSize", "coastInfluence",
        "curvatureReference", "slopeReference", "flatDeepSlope",
        "maxNeighbourRatio", "maxSizeGradient",
      ],
      seabed_generate_adaptive: ["generator", "boundaryDetail", "maxCells", "allowLarge", "generatorTimeoutMinutes"],
      seabed_validate: ["isobaths", "worstCells", "maxNearestDistance"],
      seabed_compare_adaptive: [
        "boundaryDetail", "generators", "levels", "levelMin", "levelMax", "detailPreset",
        "maxCells", "allowLarge", "generatorTimeoutMinutes",
      ],
    };
    for (const key of allowedParameters[job.kind] ?? []) {
      const value = job.input[key];
      if (
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.length <= 120)
      ) input[key] = value;
    }
    return input;
  }
  return null;
}

function knownProvenance(
  value: unknown
): CalculationMetadataExportV1["provenance"] {
  if (!isRecord(value)) return null;

  const dataset =
    typeof value.datasetId === "string" && uuidPattern.test(value.datasetId)
      ? {
          id: value.datasetId,
          schemaVersion: countOrNull(value.datasetSchemaVersion),
          source: textOrNull(value.source),
          sourceRevision: textOrNull(value.sourceRevision),
          license: textOrNull(value.license),
          crs: textOrNull(value.crs),
          coordinateUnit: textOrNull(value.coordinateUnit),
          pointCount: countOrNull(value.pointCount),
          sha256: sha256OrNull(value.sha256),
        }
      : null;

  const declared = isRecord(value.declaredSources)
    ? value.declaredSources
    : null;
  const declaredSources = declared
    ? {
        generatedAt: textOrNull(declared.generatedAt),
        coastline: textOrNull(declared.coastline),
        waves: textOrNull(declared.waves),
        bathymetry: textOrNull(declared.bathymetry),
        structures: textOrNull(declared.structures),
        structuresWarning: textOrNull(declared.structuresWarning),
      }
    : null;

  const inputFiles = Array.isArray(value.files)
    ? value.files.flatMap((file) => {
        if (!isRecord(file)) return [];
        const sizeBytes = countOrNull(file.sizeBytes);
        const sha256 = sha256OrNull(file.sha256);
        const role = textOrNull(file.role);
        const origin: "upload" | "artifact" | undefined = file.origin === "upload" || file.origin === "artifact"
          ? file.origin : undefined;
        const filename = textOrNull(file.filename);
        const source = textOrNull(file.source);
        const license = textOrNull(file.license);
        const crs = textOrNull(file.crs);
        const coordinateUnit = textOrNull(file.coordinateUnit);
        return sizeBytes !== null || sha256 !== null
          ? [{
              ...(typeof file.id === "string" && uuidPattern.test(file.id) ? { id: file.id } : {}),
              ...(role ? { role } : {}),
              ...(origin ? { origin } : {}),
              ...(typeof file.sourceJobId === "string" && uuidPattern.test(file.sourceJobId)
                ? { sourceJobId: file.sourceJobId } : {}),
              ...(filename ? { filename } : {}),
              ...(source ? { source } : {}),
              ...(license ? { license } : {}),
              ...(crs ? { crs } : {}),
              ...(coordinateUnit ? { coordinateUnit } : {}),
              sizeBytes, sha256,
            }]
          : [];
      })
    : [];

  return dataset || declaredSources || inputFiles.length > 0
    ? { dataset, declaredSources, inputFiles }
    : null;
}

export function calculationMetadataExport(
  job: CalculationJobDto
): CalculationMetadataExportV1 {
  const summary = isRecord(job.resultSummary) ? job.resultSummary : null;
  return {
    format: "litora.calculation-metadata",
    schemaVersion: 1,
    calculation: {
      id: job.id,
      kind: job.kind,
      status: job.status,
      input: knownInput(job),
      inputSchemaVersion: job.inputSchemaVersion,
      resultSchemaVersion: job.resultSchemaVersion,
      coreVersion: job.coreVersion,
      methodId: job.methodId,
      methodRevision: job.methodRevision,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
    },
    provenance: knownProvenance(summary?.provenance),
    artifacts: job.artifacts.map((file) => ({
      id: file.id,
      category: file.category,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    })),
  };
}
