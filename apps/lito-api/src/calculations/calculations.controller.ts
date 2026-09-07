import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CalculationJobDto } from "@litora/contracts";
import { CalculationsRepository } from "./calculations.repository.js";

@Controller("calculations")
@ApiTags("calculations")
export class CalculationsController {
  constructor(
    @Inject(CalculationsRepository)
    private readonly calculations: CalculationsRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: "Список последних расчётов" })
  list(): Promise<CalculationJobDto[]> {
    return this.calculations.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "Расчёт и его артефакты" })
  get(@Param("id") id: string): Promise<CalculationJobDto> {
    return this.calculations.get(id);
  }
}
