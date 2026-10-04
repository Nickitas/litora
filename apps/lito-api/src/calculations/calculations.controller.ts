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
import { calculationKinds, validateCalculation } from "./commands.js";
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
    return calculationKinds;
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
          enum: ["dimension", "dimension_dataset", "map", "erosion"],
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
            datasetId: {
              type: "string",
              format: "uuid",
              description:
                "Только для dimension_dataset; набор должен принадлежать пользователю",
            },
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
    return this.calculations.create(req.user.id, validateCalculation(body));
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
    enum: ["dimension", "dimension_dataset", "map", "erosion"],
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
