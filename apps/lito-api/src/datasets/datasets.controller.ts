import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
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
import { DatasetDetailResponse, DatasetResponse } from "../http-models.js";
import { DatasetsRepository } from "./datasets.repository.js";
import {
  maxDatasetBytes,
  maxDatasetPoints,
  maxDatasetsPerUser,
  validateDataset,
} from "./validation.js";

const datasetIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("Некорректный UUID набора данных"),
});

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

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Паспорт и геометрия собственного набора" })
  @ApiResponse({ status: 200, type: DatasetDetailResponse })
  @ApiResponse({ status: 400, description: "Некорректный UUID" })
  @ApiResponse({ status: 401, description: "Требуется авторизация" })
  @ApiResponse({
    status: 404,
    description: "Набор отсутствует или принадлежит другому пользователю",
  })
  @ApiResponse({
    status: 503,
    description:
      "Сохранённый объект недоступен или не прошёл проверку целостности",
  })
  async detail(
    @Req() req: AuthRequest,
    @Param("id", datasetIdPipe) id: string,
  ) {
    return (await this.datasets.readOwned(id, req.user.id)).detail;
  }

  @Get(":id/content")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    summary: "Скачать сохранённые байты GeoJSON собственного набора",
  })
  @ApiResponse({
    status: 200,
    description: "GeoJSON LineString; размер и SHA-256 соответствуют паспорту",
    content: {
      "application/geo+json": { schema: { type: "string", format: "binary" } },
    },
  })
  @ApiResponse({ status: 400, description: "Некорректный UUID" })
  @ApiResponse({ status: 401, description: "Требуется авторизация" })
  @ApiResponse({
    status: 404,
    description: "Набор отсутствует или принадлежит другому пользователю",
  })
  @ApiResponse({
    status: 503,
    description:
      "Сохранённый объект недоступен или не прошёл проверку целостности",
  })
  async content(
    @Req() req: AuthRequest,
    @Param("id", datasetIdPipe) id: string,
  ) {
    const { bytes } = await this.datasets.readOwned(id, req.user.id);
    return new StreamableFile(bytes, {
      type: "application/geo+json; charset=utf-8",
      disposition: `attachment; filename="dataset-${id}.geojson"`,
      length: bytes.length,
    });
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
          description:
            "Необязательная заявленная версия, дата снимка или ID выгрузки источника; API не подтверждает её независимо",
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
