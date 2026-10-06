import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateScientificInputDto,
  ReusableScientificArtifactDto,
  ScientificInputDto,
  ScientificInputRole,
} from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import {
  maxScientificInputTotalBytes,
  maxScientificInputsPerUser,
} from "./validation.js";
import { maxReusableArtifactBytes, reusableArtifactRole } from "./reusable-artifacts.js";

export interface ScientificInputRow {
  id: string;
  owner_id: string;
  name: string;
  role: ScientificInputRole;
  filename: string;
  size_bytes: string;
  source: string;
  source_revision: string | null;
  license: string;
  crs: string;
  coordinate_unit: string;
  status: ScientificInputDto["status"];
  sha256: string | null;
  object_key: string;
  created_at: Date;
}

interface ReusableArtifactRow {
  id: string;
  job_id: string;
  job_kind: string;
  filename: string;
  size_bytes: string;
  sha256: string;
  object_key: string;
  created_at: Date;
}

export interface ResolvedScientificInput {
  id: string;
  role: ScientificInputRole;
  filename: string;
  size_bytes: string;
  sha256: string;
  object_key: string;
  source: string;
  source_revision: string | null;
  license: string | null;
  crs: string | null;
  coordinate_unit: string | null;
  origin: "upload" | "artifact";
  source_job_id?: string;
}

function dto(row: ScientificInputRow): ScientificInputDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    filename: row.filename,
    sizeBytes: Number(row.size_bytes),
    source: row.source,
    ...(row.source_revision ? { sourceRevision: row.source_revision } : {}),
    license: row.license,
    crs: row.crs,
    coordinateUnit: row.coordinate_unit,
    status: row.status,
    sha256: row.sha256,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class ScientificInputsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async create(userId: string, input: CreateScientificInputDto) {
    const id = randomUUID();
    return this.db.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      const usage = await client.query<{ count: string; bytes: string }>(
        `SELECT count(*)::text AS count, coalesce(sum(size_bytes),0)::text AS bytes
         FROM scientific_inputs WHERE owner_id=$1`,
        [userId],
      );
      if (
        Number(usage.rows[0].count) >= maxScientificInputsPerUser ||
        Number(usage.rows[0].bytes) + input.sizeBytes > maxScientificInputTotalBytes
      )
        throw new ConflictException("Достигнут лимит научных входных файлов");
      const result = await client.query<ScientificInputRow>(
        `INSERT INTO scientific_inputs
         (id,owner_id,name,role,filename,size_bytes,source,source_revision,license,crs,coordinate_unit,object_key)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id, userId, input.name, input.role, input.filename, input.sizeBytes,
          input.source, input.sourceRevision ?? null, input.license, input.crs,
          input.coordinateUnit, `users/${userId}/scientific-inputs/${id}`],
      );
      return dto(result.rows[0]);
    });
  }

  async list(userId: string): Promise<ScientificInputDto[]> {
    const result = await this.db.query<ScientificInputRow>(
      "SELECT * FROM scientific_inputs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
      [userId],
    );
    return result.rows.map(dto);
  }

  async resolveOwnedSource(
    id: string, userId: string, role: ScientificInputRole, bucket: string,
  ): Promise<ResolvedScientificInput> {
    const input = await this.db.query<ScientificInputRow>(
      "SELECT * FROM scientific_inputs WHERE id=$1 AND owner_id=$2 AND role=$3 AND status='ready'",
      [id, userId, role],
    );
    if (input.rows[0]) {
      const row = input.rows[0];
      if (!row.sha256) throw new ConflictException("У научного файла нет SHA-256");
      return { ...row, sha256: row.sha256, origin: "upload" };
    }
    const artifact = await this.db.query<ReusableArtifactRow>(
      `SELECT a.id,a.job_id,j.kind AS job_kind,a.filename,a.size_bytes,a.sha256,
              a.object_key,a.created_at
       FROM calculation_artifacts a JOIN calculation_jobs j ON j.id=a.job_id
       WHERE a.id=$1 AND j.user_id=$2 AND j.status='succeeded'
         AND a.category='output' AND a.bucket=$3`,
      [id, userId, bucket],
    );
    const row = artifact.rows[0];
    if (!row || reusableArtifactRole(row.job_kind, row.filename) !== role ||
        Number(row.size_bytes) < 1 || Number(row.size_bytes) > maxReusableArtifactBytes ||
        !/^[a-f0-9]{64}$/.test(row.sha256))
      throw new NotFoundException("Совместимый научный файл не найден");
    return {
      id: row.id, role, filename: row.filename, size_bytes: row.size_bytes,
      sha256: row.sha256, object_key: row.object_key,
      source: `Артефакт расчёта ${row.job_id}`, source_revision: null,
      license: null, crs: null, coordinate_unit: null,
      origin: "artifact", source_job_id: row.job_id,
    };
  }

  async listReusableArtifacts(userId: string, bucket: string): Promise<ReusableScientificArtifactDto[]> {
    const result = await this.db.query<ReusableArtifactRow>(
      `SELECT a.id,a.job_id,j.kind AS job_kind,a.filename,a.size_bytes,a.sha256,
              a.object_key,a.created_at
       FROM calculation_artifacts a JOIN calculation_jobs j ON j.id=a.job_id
       WHERE j.user_id=$1 AND j.status='succeeded' AND a.category='output'
         AND a.bucket=$2 AND a.size_bytes BETWEEN 1 AND $3
         AND (
           (j.kind='source_file' AND
             (a.filename LIKE '%.geojson' OR a.filename LIKE '%.json')) OR
           (j.kind='mesh' AND a.filename LIKE 'mesh/msh/%.msh') OR
           (j.kind='seabed_build' AND a.filename IN
             ('seabed/black-sea-depth.msh','seabed/export-metadata.json')) OR
           (j.kind='seabed_adapt' AND a.filename IN
             ('seabed/adaptive/size-field.csv','seabed/adaptive/size-field.json'))
         )
       ORDER BY a.created_at DESC LIMIT 500`,
      [userId, bucket, maxReusableArtifactBytes],
    );
    return result.rows.flatMap((row) => {
      const role = reusableArtifactRole(row.job_kind, row.filename);
      if (!role || !/^[a-f0-9]{64}$/.test(row.sha256)) return [];
      return [{
        id: row.id, jobId: row.job_id, jobKind: row.job_kind,
        role, filename: row.filename, sizeBytes: Number(row.size_bytes),
        sha256: row.sha256, createdAt: row.created_at.toISOString(),
      }];
    });
  }

  async beginUpload(id: string, userId: string) {
    const owned = await this.db.query<{ id: string }>(
      "SELECT id FROM scientific_inputs WHERE id=$1 AND owner_id=$2",
      [id, userId],
    );
    if (!owned.rows[0]) throw new NotFoundException("Научный файл не найден");
    const objectKey = `users/${userId}/scientific-inputs/${id}/${randomUUID()}`;
    const result = await this.db.query<ScientificInputRow>(
      `UPDATE scientific_inputs SET status='uploading',upload_started_at=now(),object_key=$3
       WHERE id=$1 AND owner_id=$2 AND
       (status='pending' OR (status='uploading' AND upload_started_at < now()-interval '4 hours'))
       RETURNING *`,
      [id, userId, objectKey],
    );
    if (!result.rows[0])
      throw new ConflictException("Файл уже загружен или загружается");
    return result.rows[0];
  }

  async finishUpload(id: string, userId: string, objectKey: string, sha256: string) {
    const result = await this.db.query<ScientificInputRow>(
      `UPDATE scientific_inputs SET status='ready',sha256=$4,ready_at=now()
       WHERE id=$1 AND owner_id=$2 AND object_key=$3 AND status='uploading' RETURNING *`,
      [id, userId, objectKey, sha256],
    );
    if (!result.rows[0]) throw new ConflictException("Загрузка файла потеряла владение");
    return dto(result.rows[0]);
  }

  async failUpload(id: string, userId: string, objectKey: string) {
    await this.db.query(
      `UPDATE scientific_inputs SET status='pending',upload_started_at=NULL
       WHERE id=$1 AND owner_id=$2 AND object_key=$3 AND status='uploading'`,
      [id, userId, objectKey],
    );
  }

  async isReadyObject(id: string, userId: string, objectKey: string) {
    const result = await this.db.query<{ id: string }>(
      "SELECT id FROM scientific_inputs WHERE id=$1 AND owner_id=$2 AND object_key=$3 AND status='ready'",
      [id, userId, objectKey],
    );
    return Boolean(result.rows[0]);
  }

  async deletePending(id: string, userId: string) {
    const result = await this.db.query<{ id: string }>(
      "DELETE FROM scientific_inputs WHERE id=$1 AND owner_id=$2 AND status='pending' RETURNING id",
      [id, userId],
    );
    if (result.rows[0]) return { deleted: true };
    const owned = await this.db.query<{ id: string }>(
      "SELECT id FROM scientific_inputs WHERE id=$1 AND owner_id=$2", [id, userId],
    );
    if (!owned.rows[0]) throw new NotFoundException("Научный файл не найден");
    throw new ConflictException("Удалять можно только незавершённые загрузки");
  }
}
