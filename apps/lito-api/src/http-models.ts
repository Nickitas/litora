import { ApiProperty } from "@nestjs/swagger";
import type {
  AuthDto,
  CalculationArtifactDto,
  CalculationJobDto,
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
  @ApiProperty({ type: String, enum: ["dimension", "map", "erosion"] })
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
  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  resultSummary!: Record<string, unknown> | null;
  @ApiProperty({ type: String, nullable: true }) coreVersion!: string | null;
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
