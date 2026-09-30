import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDatasetDto, DatasetDto } from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";

export interface DatasetRow {
  id: string;
  owner_id: string;
  name: string;
  source: string;
  license: string;
  crs: "EPSG:4326";
  coordinate_unit: "degrees";
  point_count: number;
  size_bytes: number;
  sha256: string;
  object_key: string;
  created_at: Date;
}

function dto(row: DatasetRow): DatasetDto {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    license: row.license,
    crs: row.crs,
    coordinateUnit: row.coordinate_unit,
    pointCount: row.point_count,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class DatasetsRepository {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  async create(
    userId: string,
    dataset: CreateDatasetDto,
    bytes: Buffer,
  ): Promise<DatasetDto> {
    const id = randomUUID();
    const objectKey = `users/${userId}/datasets/${id}.geojson`;
    const digest = createHash("sha256").update(bytes).digest("hex");
    await this.storage.uploadBytes(objectKey, bytes, "application/geo+json");
    try {
      const result = await this.db.query<DatasetRow>(
        `INSERT INTO datasets(id,owner_id,name,source,license,crs,coordinate_unit,point_count,size_bytes,sha256,object_key)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          id,
          userId,
          dataset.name,
          dataset.source,
          dataset.license,
          dataset.crs,
          dataset.coordinateUnit,
          dataset.geometry.coordinates.length,
          bytes.length,
          digest,
          objectKey,
        ],
      );
      return dto(result.rows[0]);
    } catch (error) {
      try {
        await this.storage.deleteObject(objectKey);
      } catch {
        console.error(
          `Не удалось убрать объект после ошибки сохранения набора ${id}`,
        );
      }
      throw error;
    }
  }

  async list(userId: string): Promise<DatasetDto[]> {
    const result = await this.db.query<DatasetRow>(
      "SELECT * FROM datasets WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
      [userId],
    );
    return result.rows.map(dto);
  }

  async getOwned(id: string, userId: string): Promise<DatasetRow> {
    const result = await this.db.query<DatasetRow>(
      "SELECT * FROM datasets WHERE id=$1 AND owner_id=$2",
      [id, userId],
    );
    if (!result.rows[0]) throw new NotFoundException("Набор данных не найден");
    return result.rows[0];
  }
}
