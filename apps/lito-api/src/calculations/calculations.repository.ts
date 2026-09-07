import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CalculationArtifactDto, CalculationJobDto } from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";

interface JobRow {
  id: string;
  kind: string;
  status: CalculationJobDto["status"];
  input: Record<string, unknown>;
  result_summary: Record<string, unknown> | null;
  core_version: string | null;
  command_line: string | null;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  updated_at: Date;
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
    jobId: string; category: string; filename: string; bucket: string;
    objectKey: string; contentType: string; sizeBytes: number; sha256: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO calculation_artifacts
       (job_id, category, filename, bucket, object_key, content_type, size_bytes, sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [input.jobId, input.category, input.filename, input.bucket, input.objectKey,
        input.contentType, input.sizeBytes, input.sha256],
    );
  }

  async complete(jobId: string, summary: Record<string, unknown>): Promise<void> {
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

  async list(): Promise<CalculationJobDto[]> {
    const result = await this.database.query<JobRow>(
      "SELECT * FROM calculation_jobs ORDER BY created_at DESC LIMIT 100",
    );
    return Promise.all(result.rows.map((row) => this.toDto(row)));
  }

  async get(id: string): Promise<CalculationJobDto> {
    const result = await this.database.query<JobRow>("SELECT * FROM calculation_jobs WHERE id = $1", [id]);
    if (!result.rows[0]) throw new NotFoundException("Расчёт не найден");
    return this.toDto(result.rows[0]);
  }

  private async toDto(row: JobRow): Promise<CalculationJobDto> {
    const artifacts = await this.database.query<ArtifactRow>(
      "SELECT * FROM calculation_artifacts WHERE job_id = $1 ORDER BY created_at",
      [row.id],
    );
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      input: row.input,
      resultSummary: row.result_summary,
      coreVersion: row.core_version,
      commandLine: row.command_line,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      startedAt: row.started_at?.toISOString() ?? null,
      finishedAt: row.finished_at?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString(),
      artifacts: await Promise.all(artifacts.rows.map(async (artifact): Promise<CalculationArtifactDto> => ({
        id: artifact.id,
        category: artifact.category,
        filename: artifact.filename,
        contentType: artifact.content_type,
        sizeBytes: Number(artifact.size_bytes),
        sha256: artifact.sha256,
        downloadUrl: await this.storage.downloadUrl(artifact.object_key),
      }))),
    };
  }
}
