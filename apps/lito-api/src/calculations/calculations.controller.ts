import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CalculationsRepository } from "./calculations.repository.js";
import { calculationKinds, resourceProfileForKind, validateCalculation } from "./commands.js";
import { environment } from "../config/environment.js";
import { AuthGuard, type AuthRequest } from "../auth/auth.guard.js";
import {
  CalculationPageResponse,
  CalculationResponse,
} from "../http-models.js";
import { parseHistoryPageQuery } from "./history-page.js";

@Controller("calculations")
@ApiTags("Расчёты")
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class CalculationsController {
  constructor(
    @Inject(CalculationsRepository)
    private readonly calculations: CalculationsRepository,
  ) {}

  @Get("kinds")
  @ApiOperation({ summary: "Доступные вычислительные сценарии" })
  kinds() {
    return calculationKinds.filter((item) =>
      environment.heavyEnabled || resourceProfileForKind(item.kind) === "standard");
  }

  @Post()
  @ApiOperation({ summary: "Поставить расчёт в очередь" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["kind"],
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: calculationKinds.map((item) => item.kind),
        },
        input: {
          type: "object",
          additionalProperties: false,
          properties: {
            steps: {
              type: "integer",
              minimum: 1,
              maximum: 48,
              description: "Только для erosion",
              default: 3,
            },
            breakingIndex: { type: "number", minimum: 0.55, maximum: 1.2, description: "erosion: индекс разрушения волн, default 0.78" },
            bermHeight: { type: "number", minimum: 0.001, maximum: 100, description: "erosion: высота бермы, м; default 2" },
            closureDepth: { type: "number", minimum: 0.001, maximum: 1000, description: "erosion: глубина замыкания, м; default 8" },
            porosity: { type: "number", minimum: 0.000001, maximum: 0.699999, description: "erosion: пористость; default 0.4" },
            cercCoefficient: { type: "number", minimum: 0.000001, maximum: 1, description: "erosion: коэффициент CERC; default 0.39" },
            offshoreSampleDistance: { type: "number", minimum: 1, maximum: 100000, description: "erosion: расстояние отбора глубины, м; default 300" },
            maxShorelineChange: { type: "number", minimum: 0.001, maximum: 1000, description: "erosion: предел смещения за состояние волн, м; default 25" },
            maxBathymetryGap: { type: "number", minimum: 1, maximum: 100000, description: "erosion: радиус поиска глубины, м; default 3000 для демо" },
            outputCsv: { type: "boolean", description: "erosion: сохранить CSV метрик в каталоге результата" },
            csvFormat: { type: "string", enum: ["long", "wide"], description: "erosion: формат CSV; default long" },
            datasetId: {
              type: "string",
              format: "uuid",
              description:
                "Только для dimension_dataset; набор должен принадлежать пользователю",
            },
            coastlineInputId: { type: "string", format: "uuid", description: "Загруженный GeoJSON-контур для source_file, map_file, dimension_file и сеточных сценариев" },
            flatMeshInputId: { type: "string", format: "uuid", description: "Плоская full-quad MSH для seabed_build" },
            bathymetryInputId: { type: "string", format: "uuid", description: "Производный набор батиметрии JSON для seabed_build" },
            bathymetryMetadataInputId: { type: "string", format: "uuid", description: "Паспорт проверенного набора батиметрии для seabed_build" },
            modelInputId: { type: "string", format: "uuid", description: "Принятая батиметрическая модель MSH" },
            referenceModelInputId: { type: "string", format: "uuid", description: "Независимая опорная модель MSH для seabed_validate" },
            referenceMetadataInputId: { type: "string", format: "uuid", description: "Паспорт EXPORT-02 опорной модели" },
            referencePassportInputId: { type: "string", format: "uuid", description: "Паспорт происхождения и неопределённости опорной модели" },
            exportMetadataInputId: { type: "string", format: "uuid", description: "Паспорт EXPORT-02" },
            sourceMetadataInputId: { type: "string", format: "uuid", description: "Паспорт источника батиметрии" },
            fieldCsvInputId: { type: "string", format: "uuid", description: "Поле ADAPT-01 CSV" },
            fieldReportInputId: { type: "string", format: "uuid", description: "Отчёт ADAPT-01 JSON" },
            isobaths: { type: "string", description: "seabed_render: глубины в метрах через запятую" },
            verticalExaggeration: { type: "number", minimum: 1, maximum: 200 },
            controlPoints: { type: "boolean" },
            worstCells: { type: "integer", minimum: 1, maximum: 1000 },
            maxNearestDistance: { type: "number", minimum: 0, maximum: 100000 },
            minSize: { type: "number", minimum: 1 },
            coastSize: { type: "number", minimum: 1 },
            shelfSize: { type: "number", minimum: 1 },
            deepSize: { type: "number", minimum: 1 },
            coastInfluence: { type: "number", minimum: 1 },
            curvatureReference: { type: "number", minimum: 0.001 },
            slopeReference: { type: "number", minimum: 0.001 },
            flatDeepSlope: { type: "number", minimum: 0.001 },
            maxNeighbourRatio: { type: "number", minimum: 1.000001 },
            maxSizeGradient: { type: "number", minimum: 0.000001 },
            cellSizes: { type: "string", description: "mesh: длины рёбер в метрах через запятую" },
            boundaryDetails: { type: "string", description: "mesh: детализации берега через запятую" },
            boundaryDetail: { type: "number", minimum: 10, maximum: 10000 },
            maxSourceDistance: { type: "number", minimum: 100, maximum: 100000 },
            coastTransition: { type: "number", minimum: 0, maximum: 100000 },
            recoverWgs84: { type: "boolean" },
            maxNodes: { type: "integer", minimum: 1000, maximum: 25000000 },
            maxOutputMiB: { type: "integer", minimum: 1, maximum: 8192 },
            generators: { type: "string", enum: ["delaunay", "frontal-quad", "parallelograms", "delaunay,frontal-quad", "delaunay,frontal-quad,parallelograms"] },
            generator: { type: "string", enum: ["delaunay", "frontal-quad", "parallelograms"] },
            levelMin: { type: "number", minimum: 10, maximum: 10000 },
            levelMax: { type: "number", minimum: 10, maximum: 10000 },
            levels: { type: "string", description: "compare-adaptive: до четырёх уровней id:min:max через запятую" },
            detailPreset: { type: "string", enum: ["none", "kizilirmak"], description: "Подробное окно сравнения сеток" },
            maxCells: { type: "integer", minimum: 1000, maximum: 25000000 },
            allowLarge: { type: "boolean" },
            generatorTimeoutMinutes: { type: "integer", minimum: 1, maximum: 120 },
          },
        },
      },
      example: { kind: "erosion", input: { steps: 3 } },
    },
  })
  @ApiResponse({
    status: 201,
    type: CalculationResponse,
    description: "Создано задание со статусом queued",
  })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    const job = validateCalculation(body);
    if (!environment.heavyEnabled && resourceProfileForKind(job.kind) === "heavy")
      throw new ServiceUnavailableException("Тяжёлые научные расчёты сейчас не запущены");
    return this.calculations.create(req.user.id, job);
  }

  @Get()
  @ApiOperation({ summary: "Последние 100 своих расчётов" })
  @ApiResponse({
    status: 200,
    type: [CalculationResponse],
    description: "Краткий список без артефактов и метрик; они доступны по id",
  })
  list(@Req() req: AuthRequest) {
    return this.calculations.list(req.user.id);
  }

  @Get("page")
  @ApiOperation({ summary: "Постраничная история своих расчётов" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["queued", "running", "succeeded", "failed", "cancelled"],
  })
  @ApiQuery({
    name: "kind",
    required: false,
    enum: calculationKinds.map((item) => item.kind),
  })
  @ApiQuery({
    name: "from",
    required: false,
    type: String,
    description: "Дата UTC YYYY-MM-DD включительно",
  })
  @ApiQuery({
    name: "to",
    required: false,
    type: String,
    description: "Дата UTC YYYY-MM-DD включительно",
  })
  @ApiQuery({
    name: "jobId",
    required: false,
    type: String,
    format: "uuid",
    description: "Поиск по точному UUID",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "1–50, по умолчанию 20",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    type: String,
    description: "Курсор из предыдущей страницы",
  })
  @ApiResponse({ status: 200, type: CalculationPageResponse })
  @ApiResponse({ status: 400, description: "Некорректный параметр или курсор" })
  listPage(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.calculations.listPage(
      req.user.id,
      parseHistoryPageQuery(query, req.user.id),
    );
  }

  @Get(":id")
  @ApiResponse({ status: 200, type: CalculationResponse })
  @ApiOperation({ summary: "Свой расчёт, метрики и ссылки на 15 минут" })
  get(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.calculations.get(id, req.user.id);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Отменить ожидающий или выполняющийся расчёт" })
  @ApiResponse({ status: 201, type: CalculationResponse })
  cancel(
    @Req() req: AuthRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.calculations.cancel(id, req.user.id);
  }
}
