import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CoastlineValidationDto,
  DatasetDto,
  ScientificInputDto,
} from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import { DatasetsRepository } from "../datasets/datasets.repository.js";
import { ScientificInputsRepository } from "../scientific-inputs/scientific-inputs.repository.js";
import { CalculationsRepository } from "../calculations/calculations.repository.js";
import { validateCalculation } from "../calculations/commands.js";
import { environment } from "../config/environment.js";
import {
  unrequestedValidation,
  validationStates,
  type CoastlineSourceType,
} from "./state.js";

@Injectable()
export class CoastlineValidationService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(DatasetsRepository) private readonly datasets: DatasetsRepository,
    @Inject(ScientificInputsRepository)
    private readonly inputs: ScientificInputsRepository,
    @Inject(CalculationsRepository)
    private readonly jobs: CalculationsRepository,
  ) {}

  private async source(type: CoastlineSourceType, id: string, userId: string) {
    if (type === "dataset") {
      const row = await this.datasets.getOwned(id, userId);
      return { id: row.id, sha256: row.sha256 };
    }
    const row = await this.inputs.ownedCoastline(id, userId);
    if (row.role !== "coastline_geojson")
      throw new NotFoundException("Береговая линия не найдена");
    if (row.status !== "ready" || !row.sha256)
      throw new ConflictException("Сначала завершите загрузку береговой линии");
    return { id: row.id, sha256: row.sha256 };
  }

  async state(
    type: CoastlineSourceType,
    id: string,
    userId: string,
  ): Promise<CoastlineValidationDto> {
    const source = await this.source(type, id, userId);
    return (
      (await validationStates(this.db, userId, type, [source])).get(id) ??
      unrequestedValidation()
    );
  }

  async enqueue(
    type: CoastlineSourceType,
    id: string,
    userId: string,
  ): Promise<CoastlineValidationDto> {
    await this.source(type, id, userId);
    if (type === "scientific" && !environment.heavyEnabled)
      throw new ConflictException(
        "Проверка научных контуров сейчас отключена. Обратитесь к оператору.",
      );
    const job = validateCalculation(
      type === "dataset"
        ? { kind: "dataset_validation", input: { datasetId: id } }
        : { kind: "coastline_validation", input: { coastlineInputId: id } },
    );
    await this.jobs.create(userId, job);
    return this.state(type, id, userId);
  }

  async afterSave(
    type: CoastlineSourceType,
    id: string,
    userId: string,
  ): Promise<CoastlineValidationDto> {
    try {
      return await this.enqueue(type, id, userId);
    } catch (error) {
      return unrequestedValidation(
        error instanceof ConflictException
          ? error.message
          : "Файл сохранён, но не удалось поставить проверку в очередь. Повторите запуск проверки позже.",
      );
    }
  }

  async decorateDatasets(
    userId: string,
    datasets: DatasetDto[],
  ): Promise<DatasetDto[]> {
    const states = await validationStates(this.db, userId, "dataset", datasets);
    return datasets.map((dataset) => ({
      ...dataset,
      validation: states.get(dataset.id) ?? unrequestedValidation(),
    }));
  }

  async decorateInputs(
    userId: string,
    inputs: ScientificInputDto[],
  ): Promise<ScientificInputDto[]> {
    const coastlines = inputs.filter(
      (input) => input.role === "coastline_geojson" && input.status === "ready",
    );
    const states = await validationStates(
      this.db,
      userId,
      "scientific",
      coastlines,
    );
    return inputs.map((input) =>
      input.role === "coastline_geojson"
        ? {
            ...input,
            validation: states.get(input.id) ?? unrequestedValidation(),
          }
        : input,
    );
  }
}
