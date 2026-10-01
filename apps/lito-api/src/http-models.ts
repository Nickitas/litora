import { ApiProperty } from "@nestjs/swagger";
import type {
  AuthDto,
  CalculationArtifactDto,
  CalculationJobDto,
  DatasetDto,
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
export class CalculationResponse implements CalculationJobDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({
    type: String,
    enum: ["dimension", "dimension_dataset", "map", "erosion"],
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
    description: "Версия схемы результата; null до успеха или для legacy-формата",
  })
  resultSchemaVersion!: number | null;
  @ApiProperty({ type: String, nullable: true }) coreVersion!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Идентификатор метода из Go-манифеста; null для старых результатов",
  })
  methodId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Ревизия реализации метода из Go-манифеста; не научная аттестация",
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
  @ApiProperty({ type: [ArtifactResponse] })
  artifacts!: CalculationArtifactDto[];
}

export class DatasetResponse implements DatasetDto {
  @ApiProperty({ type: String, format: "uuid" }) id!: string;
  @ApiProperty({ type: Number, example: 1 }) schemaVersion!: number;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) source!: string;
  @ApiProperty({ type: String }) license!: string;
  @ApiProperty({ type: String, enum: ["EPSG:4326"] }) crs!: "EPSG:4326";
  @ApiProperty({ type: String, enum: ["degrees"] }) coordinateUnit!: "degrees";
  @ApiProperty({ type: Number }) pointCount!: number;
  @ApiProperty({ type: Number }) sizeBytes!: number;
  @ApiProperty({ type: String }) sha256!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
