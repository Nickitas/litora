import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthGuard, type AuthRequest } from "../auth/auth.guard.js";
import { DatasetResponse } from "../http-models.js";
import { DatasetsRepository } from "./datasets.repository.js";
import {
  maxDatasetBytes,
  maxDatasetPoints,
  maxDatasetsPerUser,
  validateDataset,
} from "./validation.js";

@Controller("datasets")
@ApiTags("Наборы данных")
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class DatasetsController {
  constructor(
    @Inject(DatasetsRepository) private readonly datasets: DatasetsRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: "Последние 100 своих наборов береговой линии" })
  @ApiResponse({ status: 200, type: [DatasetResponse] })
  list(@Req() req: AuthRequest) {
    return this.datasets.list(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: "Сохранить малый GeoJSON LineString в приватном S3",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "name",
        "source",
        "license",
        "crs",
        "coordinateUnit",
        "geometry",
      ],
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: 100 },
        source: {
          type: "string",
          maxLength: 200,
          description: "Заявленный источник данных",
        },
        sourceRevision: {
          type: "string",
          maxLength: 120,
          description: "Необязательная заявленная версия, дата снимка или ID выгрузки источника; API не подтверждает её независимо",
        },
        license: {
          type: "string",
          maxLength: 100,
          description: "Заявленная лицензия",
        },
        crs: { type: "string", enum: ["EPSG:4326"] },
        coordinateUnit: { type: "string", enum: ["degrees"] },
        geometry: {
          type: "object",
          required: ["type", "coordinates"],
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["LineString"] },
            coordinates: {
              type: "array",
              minItems: 2,
              maxItems: maxDatasetPoints,
              items: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: { type: "number" },
              },
            },
          },
        },
      },
      description: `Только EPSG:4326, долгота/широта в градусах. GeoJSON не больше ${maxDatasetBytes} байт. До ${maxDatasetsPerUser} наборов на пользователя. Научная проверка выполняется Go при расчёте.`,
    },
  })
  @ApiResponse({ status: 201, type: DatasetResponse })
  @ApiResponse({
    status: 400,
    description: "Недопустимый формат, CRS или единицы",
  })
  @ApiResponse({
    status: 413,
    description: "Превышен размер набора или HTTP body",
  })
  @ApiResponse({
    status: 409,
    description: "Достигнут лимит сохранённых наборов данных",
  })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    const { dataset, bytes } = validateDataset(body);
    return this.datasets.create(req.user.id, dataset, bytes);
  }
}
