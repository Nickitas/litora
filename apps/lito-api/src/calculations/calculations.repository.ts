import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CalculationArtifactDto,
  CalculationJobDto,
  CreateCalculationDto,
} from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { calculationInputSchemaVersion } from "../schema-versions.js";

export interface JobRow {
  id: string;
  kind: string;
  status: CalculationJobDto["status"];
  input: Record<string, unknown>;
  input_schema_version: number | null;
  result_summary: Record<string, unknown> | null;
  result_schema_version: number | null;
  core_version: string | null;
  method_id: string | null;
  method_revision: string | null;
  command_line: string | null;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  updated_at: Date;
  worker_id: string | null;
  user_id: string | null;
  dataset_id: string | null;
}

interface ArtifactRow {
  id: string;
  category: string;
  filename: string;
  object_key: string;
  content_type: string;
  size_bytes: string;
  sha256: string;
}

@Injectable()
export class CalculationsRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  async createImportedJob(kind: string, commandLine: string): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `INSERT INTO calculation_jobs (kind, status, command_line, started_at)
       VALUES ($1, 'running', $2, now()) RETURNING id`,
      [kind, commandLine],
    );
    return result.rows[0].id;
  }

  async addArtifact(input: {
    jobId: string;
    category: string;
    filename: string;
    bucket: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO calculation_artifacts
       (job_id, category, filename, bucket, object_key, content_type, size_bytes, sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.jobId,
        input.category,
        input.filename,
        input.bucket,
        input.objectKey,
        input.contentType,
        input.sizeBytes,
        input.sha256,
      ],
    );
  }

  async removeArtifact(jobId: string, objectKey: string): Promise<void> {
    await this.database.query(
      "DELETE FROM calculation_artifacts WHERE job_id=$1 AND object_key=$2",
      [jobId, objectKey],
    );
  }

  async complete(
    jobId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    await this.database.query(
      `UPDATE calculation_jobs SET status = 'succeeded', result_summary = $2,
       finished_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, summary],
    );
  }

  async fail(jobId: string, message: string): Promise<void> {
    await this.database.query(
      `UPDATE calculation_jobs SET status = 'failed', error_message = $2,
       finished_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, message],
    );
  }

  async create(
    userId: string,
    job: CreateCalculationDto,
  ): Promise<CalculationJobDto> {
    const datasetId =
      job.kind === "dimension_dataset" ? job.input?.datasetId : null;
    if (job.kind === "dimension_dataset" && !datasetId)
      throw new BadRequestException("Укажите UUID своего набора данных");
    if (datasetId) {
      const owned = await this.database.query<{ id: string }>(
        "SELECT id FROM datasets WHERE id=$1 AND owner_id=$2",
        [datasetId, userId],
      );
      if (!owned.rows[0]) throw new NotFoundException("Набор данных не найден");
    }
    const row = await this.database.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        userId,
      ]);
      const result = await client.query<JobRow>(
        `INSERT INTO calculation_jobs(user_id,kind,input,dataset_id,input_schema_version)
        SELECT $1,$2,$3,$4,$5 WHERE (SELECT count(*) FROM calculation_jobs WHERE user_id=$1 AND status IN ('queued','running')) < 5 RETURNING *`,
        [userId, job.kind, job.input ?? {}, datasetId, calculationInputSchemaVersion],
      );
      if (!result.rows[0])
        throw new ConflictException(
          "Уже есть 5 незавершённых расчётов. Дождитесь завершения или отмените лишние",
        );
      await client.query(
        "INSERT INTO calculation_events(job_id,event_type) VALUES($1,'queued')",
        [result.rows[0].id],
      );
      return result.rows[0];
    });
    return this.toDto(row);
  }

  async list(userId: string): Promise<CalculationJobDto[]> {
    const result = await this.database.query<JobRow>(
      "SELECT * FROM calculation_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [userId],
    );
    return Promise.all(result.rows.map((row) => this.toDto(row, false)));
  }

  async get(id: string, userId: string): Promise<CalculationJobDto> {
    const result = await this.database.query<JobRow>(
      "SELECT * FROM calculation_jobs WHERE id = $1 AND user_id=$2",
      [id, userId],
    );
    if (!result.rows[0]) throw new NotFoundException("Расчёт не найден");
    return this.toDto(result.rows[0]);
  }

  async cancel(id: string, userId: string): Promise<CalculationJobDto> {
    await this.get(id, userId);
    await this.database.query(
      `WITH cancelled AS (UPDATE calculation_jobs SET status='cancelled', finished_at=now(), updated_at=now()
      WHERE id=$1 AND user_id=$2 AND status IN ('queued','running') RETURNING id)
      INSERT INTO calculation_events(job_id,event_type) SELECT id,'cancelled' FROM cancelled`,
      [id, userId],
    );
    return this.get(id, userId);
  }

  async claim(workerId: string): Promise<JobRow | undefined> {
    const result = await this.database.query<JobRow>(
      `WITH candidate AS (
      SELECT id FROM calculation_jobs WHERE status='queued' AND user_id IS NOT NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE calculation_jobs j SET status='running', worker_id=$1, heartbeat_at=now(), started_at=now(), updated_at=now()
      FROM candidate c WHERE j.id=c.id RETURNING j.*`,
      [workerId],
    );
    return result.rows[0];
  }

  private async toDto(
    row: JobRow,
    includeArtifacts = true,
  ): Promise<CalculationJobDto> {
    const artifacts = includeArtifacts
      ? await this.database.query<ArtifactRow>(
          "SELECT * FROM calculation_artifacts WHERE job_id = $1 ORDER BY created_at",
          [row.id],
        )
      : { rows: [] };
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      input: row.input,
      inputSchemaVersion: row.input_schema_version,
      resultSummary: includeArtifacts ? row.result_summary : null,
      resultSchemaVersion: row.result_schema_version,
      coreVersion: row.core_version,
      methodId: row.method_id,
      methodRevision: row.method_revision,
      commandLine: row.command_line,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      startedAt: row.started_at?.toISOString() ?? null,
      finishedAt: row.finished_at?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString(),
      artifacts: await Promise.all(
        artifacts.rows.map(
          async (artifact): Promise<CalculationArtifactDto> => ({
            id: artifact.id,
            category: artifact.category,
            filename: artifact.filename,
            contentType: artifact.content_type,
            sizeBytes: Number(artifact.size_bytes),
            sha256: artifact.sha256,
            downloadUrl: await this.storage.downloadUrl(artifact.object_key),
          }),
        ),
      ),
    };
  }
}
