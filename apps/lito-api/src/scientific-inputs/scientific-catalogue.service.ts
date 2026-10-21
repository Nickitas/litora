import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  SaveScientificCatalogueDto,
  ScientificCatalogueEntryDto,
  ScientificInputDto,
} from "@litora/contracts";
import { environment } from "../config/environment.js";
import {
  bundledBlackSeaPath,
  bundledInputProvenance,
} from "../calculations/input-provenance.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CoastlineValidationService } from "../coastline-validation/coastline-validation.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";
import { validateScientificFile } from "./file-validation.js";

export const wholeSeaCatalogueId = "black-sea-marineregions";
const expectedChecksum =
  "116dcbc076ff0086e8bb3d72a34fc1df5353dc3c93c5cad91a99c336e039d246";

export function parseCatalogueSave(body: unknown): SaveScientificCatalogueDto {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Укажите название своей копии");
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => key !== "name") ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.trim().length > 100
  )
    throw new BadRequestException(
      "Ожидается только название от 1 до 100 символов"
    );
  return { name: value.name.trim() };
}

/** Читает единственный разрешённый исходник; пути и URL не поступают из HTTP. */
export async function wholeSeaCatalogueSource(
  cliDirectory = environment.cliDirectory
): Promise<{ entry: ScientificCatalogueEntryDto; bytes: Buffer }> {
  const provenance = await bundledInputProvenance(
    "coastline_region",
    join(cliDirectory, "data")
  );
  const bytes = await readFile(join(cliDirectory, bundledBlackSeaPath));
  if (
    createHash("sha256").update(bytes).digest("hex") !== expectedChecksum ||
    bytes.length !== 299701
  )
    throw new Error("Закреплённый полный контур изменён или повреждён");
  return {
    bytes,
    entry: {
      id: wholeSeaCatalogueId,
      name: "Чёрное море · граница MarineRegions",
      role: "coastline_geojson",
      filename: "black-sea-marineregions.geojson",
      sizeBytes: bytes.length,
      source: provenance.source!,
      sourceRevision: provenance.sourceRevision!,
      license: provenance.license!,
      crs: "EPSG:4326",
      coordinateUnit: "degrees",
      sha256: expectedChecksum,
      sourceUrl:
        "https://www.marineregions.org/gazetteer.php?p=details&id=3319",
      licenseUrl: "https://www.marineregions.org/disclaimer.php",
      geometryKind: "sea_area_boundary",
      purpose:
        "Обзор всего Чёрного моря и выделение фрагментов границы морского района",
      limitations: [
        "Граница IHO Sea Area включает служебные границы акватории; это не береговая съёмка.",
        "Независимая точность положения берега и дата его наблюдения не подтверждены.",
        "Выделение области не повышает детализацию и точность исходника; временного ряда для прогноза нет.",
        "Для детального исследования локального берега выберите подходящий источник и независимый контроль.",
      ],
    },
  };
}

@Injectable()
export class ScientificCatalogueService {
  constructor(
    @Inject(ScientificInputsRepository)
    private readonly inputs: ScientificInputsRepository,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
    @Inject(CoastlineValidationService)
    private readonly validation: CoastlineValidationService
  ) {}

  async catalogue(): Promise<ScientificCatalogueEntryDto[]> {
    try {
      return [(await wholeSeaCatalogueSource()).entry];
    } catch {
      throw new ServiceUnavailableException(
        "Полный исходник временно недоступен. Повторите попытку позже."
      );
    }
  }

  async save(
    userId: string,
    id: string,
    body: unknown
  ): Promise<ScientificInputDto> {
    if (id !== wholeSeaCatalogueId)
      throw new NotFoundException("Научный источник каталога не найден");
    const { name } = parseCatalogueSave(body);
    let source: Awaited<ReturnType<typeof wholeSeaCatalogueSource>>;
    try {
      source = await wholeSeaCatalogueSource();
      await validateScientificFile(
        join(environment.cliDirectory, bundledBlackSeaPath),
        "coastline_geojson",
        source.entry.filename
      );
    } catch {
      throw new ServiceUnavailableException(
        "Не удалось проверить закреплённый исходник. Повторите попытку позже."
      );
    }
    const { entry, bytes } = source;
    const reserved = await this.inputs.create(
      userId,
      {
        name,
        role: entry.role,
        filename: entry.filename,
        sizeBytes: entry.sizeBytes,
        source: entry.source,
        sourceRevision: entry.sourceRevision,
        license: entry.license,
        crs: entry.crs,
        coordinateUnit: entry.coordinateUnit,
      },
      entry.sha256
    );
    if (reserved.status === "ready")
      return {
        ...reserved,
        validation: await this.validation.state(
          "scientific",
          reserved.id,
          userId
        ),
      };
    const claimed = await this.inputs.beginUpload(reserved.id, userId);
    try {
      await this.storage.uploadBytes(
        claimed.object_key,
        bytes,
        "application/geo+json"
      );
      const ready = await this.inputs.finishUpload(
        reserved.id,
        userId,
        claimed.object_key,
        entry.sha256
      );
      return {
        ...ready,
        validation: await this.validation.afterSave(
          "scientific",
          ready.id,
          userId
        ),
      };
    } catch (error) {
      const ready = await this.inputs
        .isReadyObject(reserved.id, userId, claimed.object_key)
        .catch(() => true);
      if (!ready)
        await this.storage
          .deleteObject(claimed.object_key)
          .catch(() => undefined);
      await this.inputs
        .failUpload(reserved.id, userId, claimed.object_key)
        .catch(() => undefined);
      throw error;
    }
  }
}
