import { ApiProperty } from "@nestjs/swagger";
import type {
  AuthDto,
  CalculationArtifactDto,
  CalculationJobDto,
  CalculationKindDto,
  CalculationPageDto,
  CoastlinePreviewDto,
  DatasetDto,
  DatasetDetailDto,
  CoastlineValidationDto,
  CoastlineValidationIssueDto,
  GeoJsonLineStringDto,
  ObservedShorelineSeriesDto,
  ReusableScientificArtifactDto,
  ScientificInputDto,
  ScientificCatalogueEntryDto,
  ScientificInputQuotaDto,
  ScientificInputRole,
  ScientificInputFormatDto,
  UserDto,
} from "@litora/contracts";

export class UserResponse implements UserDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String, format: "email" }) email!: string;
  @ApiProperty({ type: String }) name!: string;
}
export class AuthResponse implements AuthDto {
  @ApiProperty({ type: UserResponse }) user!: UserDto;
  @ApiProperty({
    type: String,
    description: "Bearer token; хранить только в памяти клиента",
  })
  accessToken!: string;
  @ApiProperty({ type: Number, example: 900 }) expiresIn!: number;
}
export class ArtifactResponse implements CalculationArtifactDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) category!: string;
  @ApiProperty({ type: String }) filename!: string;
  @ApiProperty({ type: String }) contentType!: string;
  @ApiProperty({ type: Number }) sizeBytes!: number;
  @ApiProperty({ type: String }) sha256!: string;
  @ApiProperty({ type: String, description: "Подписанная ссылка на 15 минут" })
  downloadUrl!: string;
}
export class CoastlinePreviewResponse implements CoastlinePreviewDto {
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({ type: String, nullable: true }) sourceRevision!: string | null;
  @ApiProperty({ type: String, nullable: true }) license!: string | null;
  @ApiProperty({ type: String }) sha256!: string;
  @ApiProperty({ type: String, enum: ["EPSG:4326"] }) crs!: "EPSG:4326";
  @ApiProperty({ type: "object", additionalProperties: true, description: "GeoJSON WGS84: [долгота, широта]" }) geojson!: Record<string, unknown>;
}
export class ScientificInputFormatResponse implements ScientificInputFormatDto {
  @ApiProperty({ type: String }) role!: ScientificInputRole;
  @ApiProperty({ type: Number, enum: [1] }) schemaVersion!: 1;
  @ApiProperty({ type: String, enum: ["json", "csv", "tsv", "msh2"] }) format!: ScientificInputFormatDto["format"];
  @ApiProperty({ type: "object", additionalProperties: true, nullable: true }) schema!: Record<string, unknown> | null;
  @ApiProperty({ type: [String], required: false }) columns?: string[];
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: Number }) maxBytes!: number;
}
export class CalculationResponse implements CalculationJobDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({
    type: String,
    enum: ["coastline_region", "source_file", "dataset_validation", "coastline_validation", "dimension", "dimension_dataset", "dimension_file", "map", "map_file", "erosion", "erosion_file", "all_demo", "all_file", "calibrate_cerc", "shoreline_data_audit", "mesh", "seabed_build", "seabed_render", "seabed_adapt", "seabed_generate_adaptive", "seabed_validate", "seabed_compare_adaptive", "seabed_assess_ml", "seabed_check_full"],
  })
  kind!: string;
  @ApiProperty({
    type: String,
    enum: ["queued", "running", "succeeded", "failed", "cancelled"],
  })
  status!: CalculationJobDto["status"];
  @ApiProperty({ type: "object", additionalProperties: true }) input!: Record<
    string,
    unknown
  >;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Версия схемы входа; null для неизвестного legacy-формата",
  })
  inputSchemaVersion!: number | null;
  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  resultSummary!: Record<string, unknown> | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Версия схемы результата; null до успеха или для legacy-формата",
  })
  resultSchemaVersion!: number | null;
  @ApiProperty({ type: String, nullable: true }) coreVersion!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Идентификатор метода из Go-манифеста; null для старых результатов",
  })
  methodId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Ревизия реализации метода из Go-манифеста; не научная аттестация",
  })
  methodRevision!: string | null;
  @ApiProperty({ type: String, nullable: true }) commandLine!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ type: String, format: "date-time", nullable: true,
    description: "Время запроса удаления; null, пока расчёт не удаляется" })
  deletionRequestedAt!: string | null;
  @ApiProperty({ type: [ArtifactResponse] })
  artifacts!: CalculationArtifactDto[];
}

export class CalculationPageResponse implements CalculationPageDto {
  @ApiProperty({ type: [CalculationResponse] }) items!: CalculationJobDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: Number }) totalCount!: number;
}

export class CoastlineValidationIssueResponse implements CoastlineValidationIssueDto {
  @ApiProperty({ type: String, enum: ["error", "warning"] }) severity!: "error" | "warning";
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: String }) message!: string;
  @ApiProperty({ type: Number, required: false }) path?: number;
  @ApiProperty({ type: Number, required: false }) point?: number;
  @ApiProperty({ type: Number, required: false }) segment?: number;
  @ApiProperty({ type: Number, required: false }) otherSegment?: number;
}

export class CalculationKindResponse implements CalculationKindDto {
  @ApiProperty({ type: String }) kind!: CalculationKindDto["kind"];
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: Boolean, required: false, description: "false скрывает служебный вид из обычного выбора нового расчёта" }) selectable?: boolean;
}

export class CoastlineValidationResponse implements CoastlineValidationDto {
  @ApiProperty({ type: String, nullable: true }) jobId!: string | null;
  @ApiProperty({ type: String, enum: ["not_requested", "queued", "running", "succeeded", "failed", "cancelled"] }) status!: CoastlineValidationDto["status"];
  @ApiProperty({ type: Boolean, nullable: true }) accepted!: boolean | null;
  @ApiProperty({ type: [CoastlineValidationIssueResponse] }) issues!: CoastlineValidationIssueDto[];
  @ApiProperty({ type: Boolean }) truncated!: boolean;
  @ApiProperty({ type: String, nullable: true }) message!: string | null;
  @ApiProperty({ type: String, nullable: true }) methodId!: string | null;
  @ApiProperty({ type: String, nullable: true }) methodRevision!: string | null;
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
}

export class DatasetResponse implements DatasetDto {
  @ApiProperty({ type: CoastlineValidationResponse, required: false }) validation?: CoastlineValidationDto;
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: Number, example: 1 }) schemaVersion!: number;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Заявленная версия источника; null, если не предоставлена",
  })
  sourceRevision!: string | null;
  @ApiProperty({ type: String }) license!: string;
  @ApiProperty({ type: String, enum: ["EPSG:4326"] }) crs!: "EPSG:4326";
  @ApiProperty({ type: String, enum: ["degrees"] }) coordinateUnit!: "degrees";
  @ApiProperty({ type: Number }) pointCount!: number;
  @ApiProperty({ type: Number }) sizeBytes!: number;
  @ApiProperty({ type: String }) sha256!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class DatasetDetailResponse extends DatasetResponse implements DatasetDetailDto {
  @ApiProperty({
    type: "object", required: ["type", "coordinates"], additionalProperties: false,
    properties: {
      type: { type: "string", enum: ["LineString"] },
      coordinates: { type: "array", minItems: 2, maxItems: 500,
        items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } },
    },
    description: "Сохранённый LineString в EPSG:4326, [долгота, широта]; просмотр не заменяет научную проверку Go",
  })
  geometry!: GeoJsonLineStringDto;
}

export class ScientificInputResponse implements ScientificInputDto {
  @ApiProperty({ type: CoastlineValidationResponse, required: false }) validation?: CoastlineValidationDto;
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, enum: ["coastline_geojson", "shoreline_timeseries_geojson", "wave_climate", "shoreline_observations_json", "longshore_sediment_sources_json", "longshore_structures_json", "flat_mesh_msh", "seabed_msh", "bathymetry_grid_json", "bathymetry_grid_metadata_json", "relief_reference_passport_json", "export_metadata_json", "bathymetry_source_json", "adaptive_field_csv", "adaptive_field_report_json", "mesh_comparison_report_json", "adaptive_comparison_report_json", "expert_organizer_key_json", "expert_ratings_tsv"] })
  role!: ScientificInputRole;
  @ApiProperty({ type: String }) filename!: string;
  @ApiProperty({ type: Number }) sizeBytes!: number;
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({ type: String, required: false }) sourceRevision?: string;
  @ApiProperty({ type: String }) license!: string;
  @ApiProperty({ type: String }) crs!: string;
  @ApiProperty({ type: String }) coordinateUnit!: string;
  @ApiProperty({ type: String, enum: ["pending", "uploading", "ready"] })
  status!: ScientificInputDto["status"];
  @ApiProperty({ type: String, nullable: true }) sha256!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class ScientificCatalogueEntryResponse implements ScientificCatalogueEntryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, enum: ["coastline_geojson"] }) role!: "coastline_geojson";
  @ApiProperty({ type: String }) filename!: string;
  @ApiProperty({ type: Number }) sizeBytes!: number;
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({ type: String, required: false }) sourceRevision?: string;
  @ApiProperty({ type: String }) license!: string;
  @ApiProperty({ type: String }) crs!: string;
  @ApiProperty({ type: String }) coordinateUnit!: string;
  @ApiProperty({ type: String }) sha256!: string;
  @ApiProperty({ type: String }) sourceUrl!: string;
  @ApiProperty({ type: String }) licenseUrl!: string;
  @ApiProperty({ type: String, enum: ["sea_area_boundary"] }) geometryKind!: "sea_area_boundary";
  @ApiProperty({ type: String }) purpose!: string;
  @ApiProperty({ type: [String] }) limitations!: string[];
}

export class ScientificInputQuotaResponse implements ScientificInputQuotaDto {
  @ApiProperty({ type: "integer", minimum: 0, description: "Число своих зарезервированных записей" }) usedCount!: number;
  @ApiProperty({ type: "integer", minimum: 1, description: "Предел числа научных файлов" }) limitCount!: number;
  @ApiProperty({ type: "integer", minimum: 0, description: "Сумма заявленных размеров своих файлов в байтах" }) usedBytes!: number;
  @ApiProperty({ type: "integer", minimum: 1, description: "Предел заявленного объёма в байтах" }) limitBytes!: number;
}

export class ObservedShorelineSeriesResponse implements ObservedShorelineSeriesDto {
  @ApiProperty({ type: Number, enum: [1] }) schemaVersion!: 1;
  @ApiProperty({ type: [Number], minItems: 4, maxItems: 4,
    description: "[запад, юг, восток, север] в EPSG:4326" })
  bounds!: [number, number, number, number];
  @ApiProperty({ type: "array", items: { type: "object", required: ["time", "satellite", "geoAccuracy", "cloudCover", "coordinates"],
    properties: {
      time: { type: "string", format: "date-time" },
      satellite: { type: "string" },
      geoAccuracy: { type: "number", nullable: true },
      cloudCover: { type: "number", nullable: true, minimum: 0, maximum: 1 },
      uncertaintyM: { type: "number", nullable: true, minimum: 0, exclusiveMinimum: true },
      tideCorrected: { type: "boolean", nullable: true },
      waterLevelCorrection: { type: "object", nullable: true, required: ["method", "source", "verticalDatum"],
        properties: {
          method: { type: "string" }, source: { type: "string" }, verticalDatum: { type: "string" },
        } },
      coordinates: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2 } },
    } } })
  frames!: ObservedShorelineSeriesDto["frames"];
}

export class ReusableScientificArtifactResponse implements ReusableScientificArtifactDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: String, format: "uuid" }) jobId!: string;
  @ApiProperty({ type: String }) jobKind!: string;
  @ApiProperty({ type: String }) role!: ScientificInputRole;
  @ApiProperty({ type: String }) filename!: string;
  @ApiProperty({ type: Number }) sizeBytes!: number;
  @ApiProperty({ type: String }) sha256!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
