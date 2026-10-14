import {
  Body,
  Controller,
  Get,
  Header,
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
              minimum: 0,
              maximum: 48,
              description: "Для erosion/all_demo: 1–48/1–24; для erosion_file/all_file: 1–48 либо 0 (весь ряд с ограничениями)",
              default: 3,
            },
            svgMaxFrames: { type: "integer", minimum: 0, maximum: 128, description: "Только erosion_file/all_file: 0 при обычном расчёте; при steps=0 — 2–128 SVG эрозии, включая первый и последний" },
            breakingIndex: { type: "number", minimum: 0.55, maximum: 1.2, description: "CERC и all: индекс разрушения волн, default 0.78" },
            bermHeight: { type: "number", minimum: 0.001, maximum: 100, description: "erosion: высота бермы, м; default 2" },
            closureDepth: { type: "number", minimum: 0.001, maximum: 1000, description: "erosion: глубина замыкания, м; default 8" },
            porosity: { type: "number", minimum: 0.000001, maximum: 0.699999, description: "erosion: пористость; default 0.4" },
            cercCoefficient: { type: "number", minimum: 0.000001, maximum: 1, description: "erosion: коэффициент CERC; default 0.39" },
            offshoreSampleDistance: { type: "number", minimum: 1, maximum: 100000, description: "erosion: расстояние отбора глубины, м; default 300" },
            maxShorelineChange: { type: "number", minimum: 0.001, maximum: 1000, description: "erosion: предел смещения за состояние волн, м; default 25" },
            maxBathymetryGap: { type: "number", minimum: 1, maximum: 100000, description: "erosion: радиус поиска глубины, м; default 3000 для демо" },
            outputCsv: { type: "boolean", description: "CERC и all: сохранить CSV метрик в каталоге результата" },
            csvFormat: { type: "string", enum: ["long", "wide"], description: "CERC и all: формат CSV; default long" },
            outputGif: { type: "boolean", description: "CERC и all: сохранить GIF" },
            gifFps: { type: "integer", minimum: 1, maximum: 30, description: "CERC и all: кадров в секунду" },
            gifSkip: { type: "integer", minimum: 1, maximum: 48, description: "erosion/all_file (1–48), all_demo (1–24): шаг кадров" },
            modelMaxPoints: { type: "integer", minimum: 0, maximum: 10000, description: "all_demo/all_file: ограничение точек модели; 0 — автоматически" },
            noModelSimplify: { type: "boolean", description: "all_demo/all_file: не упрощать базовую линию при modelMaxPoints=0" },
            bathymetryResolution: { type: "number", minimum: 0.000000001, maximum: 1, description: "calibrate_cerc: фактический шаг батиметрии в градусах; обязателен и проверяется Go против паспорта" },
            cercCoefficients: { type: "string", description: "calibrate_cerc: от одного до восьми коэффициентов (0;1] через запятую" },
            maxObservationDistance: { type: "number", minimum: 1, maximum: 100000, description: "calibrate_cerc: допустимая дистанция наблюдения до берега, м" },
            minWaveHours: { type: "number", minimum: 8766, maximum: 100000, description: "calibrate_cerc: минимальное покрытие волнового ряда, ч" },
            leftBoundaryTransport: { type: "number", minimum: -1000000, maximum: 1000000, description: "erosion, all и calibrate_cerc: поток через левую границу, м³/с; положительный входит в сегмент" },
            rightBoundaryTransport: { type: "number", minimum: -1000000, maximum: 1000000, description: "erosion, all и calibrate_cerc: поток через правую границу, м³/с; положительный выходит из сегмента" },
            datasetId: {
              type: "string",
              format: "uuid",
              description:
                "Только для dimension_dataset; набор должен принадлежать пользователю",
            },
            coastlineInputId: { type: "string", format: "uuid", description: "Загруженный GeoJSON-контур для source_file, map_file, dimension_file, erosion_file, all_file, calibrate_cerc и сеточных сценариев" },
            waveInputId: { type: "string", format: "uuid", description: "erosion_file/all_file/calibrate_cerc: волновой ряд CSV/JSON, принадлежащий пользователю" },
            observationsInputId: { type: "string", format: "uuid", description: "calibrate_cerc: независимые годовые скорости берега, JSON EPSG:4326" },
            sedimentSourcesInputId: { type: "string", format: "uuid", description: "erosion_file/all_file/calibrate_cerc: необязательный JSON источников и стоков наносов; для all_file только без упрощения" },
            structuresInputId: { type: "string", format: "uuid", description: "erosion_file/all_file/calibrate_cerc: необязательный JSON сооружений; для all_file только без упрощения" },
            flatMeshInputId: { type: "string", format: "uuid", description: "Плоская MSH для seabed_build или QA-03; в QA-03 максимум 256 МиБ" },
            meshReportInputId: { type: "string", format: "uuid", description: "QA-03: отчёт mesh-comparison.json того же запуска, с SHA-256 выбранной MSH" },
            bathymetryInputId: { type: "string", format: "uuid", description: "Производный набор батиметрии JSON для erosion_file, all_file, calibrate_cerc и seabed_build" },
            bathymetryMetadataInputId: { type: "string", format: "uuid", description: "Паспорт проверенного набора батиметрии для erosion_file, all_file, calibrate_cerc и seabed_build" },
            modelInputId: { type: "string", format: "uuid", description: "Принятая батиметрическая модель MSH" },
            referenceModelInputId: { type: "string", format: "uuid", description: "Независимая опорная модель MSH для seabed_validate" },
            referenceMetadataInputId: { type: "string", format: "uuid", description: "Паспорт EXPORT-02 опорной модели" },
            referencePassportInputId: { type: "string", format: "uuid", description: "Паспорт происхождения и неопределённости опорной модели" },
            exportMetadataInputId: { type: "string", format: "uuid", description: "Паспорт EXPORT-02" },
            sourceMetadataInputId: { type: "string", format: "uuid", description: "Паспорт источника батиметрии" },
            fieldCsvInputId: { type: "string", format: "uuid", description: "Поле ADAPT-01 CSV" },
            fieldReportInputId: { type: "string", format: "uuid", description: "Отчёт ADAPT-01 JSON" },
            ratingsInputId: { type: "string", format: "uuid", description: "AI-02: заполненный TSV экспертных оценок" },
            organizerKeyInputId: { type: "string", format: "uuid", description: "AI-02: закрытый ключ AI-01, доступный только владельцу" },
            comparisonReportInputId: { type: "string", format: "uuid", description: "AI-02: принятый отчёт ADAPT-03 из того же набора карточек" },
            minExpertsPerCard: { type: "integer", minimum: 2, maximum: 10, description: "AI-02: независимых экспертов на карточку" },
            minTraining: { type: "integer", minimum: 2, maximum: 96, description: "AI-02: минимум карточек обучения" },
            minEvaluation: { type: "integer", minimum: 2, maximum: 96, description: "AI-02: минимум карточек независимой проверки" },
            ridgeLambda: { type: "number", minimum: 0.000001, maximum: 1000, description: "AI-02: регуляризация ridge-кандидата" },
            minRmseImprovement: { type: "number", minimum: 0.001, maximum: 0.99, description: "AI-02: минимальное относительное улучшение RMSE" },
            isobaths: { type: "string", description: "seabed_render/QA-03: глубины в метрах через запятую" },
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
            targetEdge: { type: "number", minimum: 10, maximum: 10000, description: "QA-03: контрольное ребро MSH, м" },
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
            generateExpertSet: { type: "boolean", description: "compare-adaptive: подготовить приватный экспертный набор AI-01 после принятого ADAPT-03" },
            expertLevels: { type: "string", description: "AI-01: до четырёх ID уровней из levels через запятую; пусто — все" },
            expertSeed: { type: "string", minLength: 1, maxLength: 80, description: "AI-01: строка анонимизации (латиница, цифры, дефис, подчёркивание)" },
            generateFigureFive: { type: "boolean", description: "Рисунок 5: собрать три фактические карточки после AI-01" },
            figureFiveLevel: { type: "string", description: "Рисунок 5: ID уровня из экспертного набора AI-01" },
            figureFiveGenerator: { type: "string", enum: ["delaunay", "frontal-quad", "parallelograms"], description: "Рисунок 5: генератор из выбранного сравнения" },
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

  @Get(":id/visualization")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Индекс интерактивной карты собственного расчёта CERC" })
  @ApiResponse({ status: 200, description: "Версионированный индекс кадров", schema: {
    type: "object", required: ["schemaVersion", "mode", "frames", "bounds", "pointCount"],
    properties: {
      schemaVersion: { type: "integer", enum: [1] },
      mode: { type: "string", enum: ["calendar", "steps"] },
      scenarioStatus: { type: "string" }, usageLimitations: { type: "array", items: { type: "string" } },
      waveSource: { type: "string" }, bathymetrySha256: { type: "string" },
      bathymetryStatus: { type: "string" }, crs: { type: "string", enum: ["EPSG:4326"] },
      coordinateUnit: { type: "string", enum: ["degrees"] },
      bounds: { type: "array", minItems: 4, maxItems: 4, items: { type: "number" } },
      pointCount: { type: "integer" },
      frames: { type: "array", items: { type: "object", properties: {
        index: { type: "integer" }, time: { type: "string", nullable: true }, chunkId: { type: "string" },
        durationHours: { type: "number", nullable: true },
        waveHeightM: { type: "number", nullable: true }, erodedVolumeM3: { type: "number", nullable: true },
        depositedVolumeM3: { type: "number", nullable: true }, balanceClosureResidualM3: { type: "number", nullable: true },
      } } },
    },
  } })
  @ApiResponse({ status: 404, description: "Расчёт или визуализация не найдены" })
  shorelineVisualization(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.calculations.shorelineVisualization(id, req.user.id);
  }

  @Get(":id/visualization/chunks/:chunkId")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ summary: "Ограниченный набор кадров собственной карты CERC" })
  @ApiResponse({ status: 200, description: "Кадры карты", schema: {
    type: "object", required: ["schemaVersion", "id", "frames"],
    properties: {
      schemaVersion: { type: "integer", enum: [1] }, id: { type: "string" },
      frames: { type: "array", items: { type: "object", properties: {
        index: { type: "integer" },
        points: { type: "array", items: { type: "object", properties: { lat: { type: "number" }, lon: { type: "number" } } } },
        cells: { type: "array", items: { type: "object", properties: { pointIndex: { type: "integer" }, shorelineChangeM: { type: "number" } } } },
      } } },
    },
  } })
  @ApiResponse({ status: 404, description: "Расчёт или кадры не найдены" })
  shorelineVisualizationChunk(
    @Req() req: AuthRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("chunkId") chunkId: string,
  ) {
    return this.calculations.shorelineVisualizationChunk(id, req.user.id, chunkId);
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
