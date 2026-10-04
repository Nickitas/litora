import type {
  CalculationJobDto,
  CalculationMetadataExportV1,
} from "@litora/contracts";

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
    return steps !== null && steps > 0 ? { steps } : null;
  }
  if (job.kind === "dimension_dataset") {
    const datasetId = job.input.datasetId;
    return typeof datasetId === "string" && uuidPattern.test(datasetId)
      ? { datasetId }
      : null;
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
        return sizeBytes !== null || sha256 !== null
          ? [{ sizeBytes, sha256 }]
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
