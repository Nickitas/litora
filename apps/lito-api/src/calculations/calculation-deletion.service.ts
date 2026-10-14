import { randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CalculationDeletionOverviewDto,
  CalculationDeletionRequestDto,
} from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";

interface DeletionRequestRow {
  id: string;
  scope: "single" | "all";
  requested_count: number;
  deleted_count: number;
  retrying_count: string;
  created_at: Date;
}

interface DeletionItemRow {
  request_id: string;
  job_id: string;
  lock_token: string;
  attempts: number;
}

@Injectable()
export class CalculationDeletionService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  async overview(userId: string): Promise<CalculationDeletionOverviewDto> {
    const result = await this.db.query<{
      total_count: string;
      active_count: string;
      settling_count: string;
      deleting_count: string;
    }>(
      `SELECT count(*)::text AS total_count,
        count(*) FILTER (WHERE status IN ('queued','running'))::text AS active_count,
        count(*) FILTER (WHERE status IN ('succeeded','failed','cancelled')
          AND worker_id IS NOT NULL)::text AS settling_count,
        count(*) FILTER (WHERE deletion_requested_at IS NOT NULL)::text AS deleting_count
       FROM calculation_jobs WHERE user_id=$1`,
      [userId],
    );
    const row = result.rows[0];
    return {
      totalCount: Number(row.total_count),
      activeCount: Number(row.active_count),
      settlingCount: Number(row.settling_count),
      deletingCount: Number(row.deleting_count),
    };
  }

  async requestSingle(userId: string, jobId: string): Promise<CalculationDeletionRequestDto> {
    const requestId = await this.db.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      const job = await client.query<{
        status: string;
        worker_id: string | null;
        deletion_requested_at: Date | null;
      }>(
        `SELECT status,worker_id,deletion_requested_at FROM calculation_jobs
         WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [jobId, userId],
      );
      const row = job.rows[0];
      if (!row) throw new NotFoundException("Расчёт не найден");
      if (row.status === "queued" || row.status === "running" || row.worker_id)
        throw new ConflictException("Дождитесь завершения расчёта и освобождения worker");
      if (row.deletion_requested_at)
        throw new ConflictException("Удаление расчёта уже запрошено");
      const dependent = await client.query(
        "SELECT 1 FROM calculation_job_dependencies WHERE source_job_id=$1 LIMIT 1",
        [jobId],
      );
      if (dependent.rowCount)
        throw new ConflictException("Этот результат используется другими расчётами. Сначала удалите зависимые расчёты");
      const request = await client.query<{ id: string }>(
        `INSERT INTO calculation_deletion_requests(user_id,scope,requested_count)
         VALUES($1,'single',1) RETURNING id`, [userId],
      );
      const id = request.rows[0].id;
      await client.query(
        "INSERT INTO calculation_deletion_items(request_id,job_id) VALUES($1,$2)",
        [id, jobId],
      );
      await client.query(
        "UPDATE calculation_jobs SET deletion_requested_at=now(),updated_at=now() WHERE id=$1",
        [jobId],
      );
      return id;
    });
    return this.getRequest(userId, requestId);
  }

  async requestAll(userId: string): Promise<CalculationDeletionRequestDto> {
    const requestId = await this.db.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      const blocked = await client.query<{
        active: string;
        settling: string;
        deleting: string;
      }>(
        `SELECT count(*) FILTER (WHERE status IN ('queued','running'))::text AS active,
          count(*) FILTER (WHERE status IN ('succeeded','failed','cancelled')
            AND worker_id IS NOT NULL)::text AS settling,
          count(*) FILTER (WHERE deletion_requested_at IS NOT NULL)::text AS deleting
         FROM calculation_jobs WHERE user_id=$1`, [userId],
      );
      const counts = blocked.rows[0];
      if (Number(counts.active) || Number(counts.settling))
        throw new ConflictException("Полная очистка недоступна, пока есть активные или завершающиеся расчёты");
      if (Number(counts.deleting))
        throw new ConflictException("Дождитесь окончания предыдущего удаления");
      const request = await client.query<{ id: string; requested_count: number }>(
        `INSERT INTO calculation_deletion_requests(user_id,scope,requested_count)
         SELECT $1,'all',count(*)::integer FROM calculation_jobs WHERE user_id=$1
         RETURNING id,requested_count`, [userId],
      );
      const { id } = request.rows[0];
      await client.query(
        `INSERT INTO calculation_deletion_items(request_id,job_id)
         SELECT $2,id FROM calculation_jobs WHERE user_id=$1`, [userId, id],
      );
      await client.query(
        `UPDATE calculation_jobs SET deletion_requested_at=now(),updated_at=now()
         WHERE user_id=$1`, [userId],
      );
      return id;
    });
    return this.getRequest(userId, requestId);
  }

  async getRequest(userId: string, requestId: string): Promise<CalculationDeletionRequestDto> {
    const result = await this.db.query<DeletionRequestRow>(
      `SELECT r.id,r.scope,r.requested_count,r.deleted_count,r.created_at,
        count(i.job_id) FILTER (WHERE i.error_code IS NOT NULL)::text AS retrying_count
       FROM calculation_deletion_requests r
       LEFT JOIN calculation_deletion_items i ON i.request_id=r.id
       WHERE r.id=$1 AND r.user_id=$2
       GROUP BY r.id`, [requestId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Запрос удаления не найден");
    const retryingCount = Number(row.retrying_count);
    return {
      id: row.id,
      scope: row.scope,
      requestedCount: row.requested_count,
      deletedCount: row.deleted_count,
      retryingCount,
      status: row.deleted_count === row.requested_count
        ? "completed" : retryingCount ? "retrying" : "pending",
      createdAt: row.created_at.toISOString(),
    };
  }

  async currentRequest(userId: string): Promise<CalculationDeletionRequestDto | null> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM calculation_deletion_requests
       WHERE user_id=$1 AND deleted_count<requested_count
       ORDER BY created_at DESC LIMIT 1`, [userId],
    );
    return result.rows[0] ? this.getRequest(userId, result.rows[0].id) : null;
  }

  async claim(): Promise<DeletionItemRow | undefined> {
    const token = randomUUID();
    const result = await this.db.query<DeletionItemRow>(
      `WITH candidate AS (
         SELECT i.request_id,i.job_id FROM calculation_deletion_items i
         JOIN calculation_jobs j ON j.id=i.job_id
         WHERE ((i.status='pending' AND i.next_attempt_at<=now())
           OR (i.status='running' AND i.locked_at<now()-interval '1 hour'))
           AND j.deletion_requested_at IS NOT NULL AND j.worker_id IS NULL
           AND j.status IN ('succeeded','failed','cancelled')
           AND NOT EXISTS (SELECT 1 FROM calculation_job_dependencies d
             WHERE d.source_job_id=j.id)
         ORDER BY j.created_at DESC
         FOR UPDATE OF i SKIP LOCKED LIMIT 1
       )
       UPDATE calculation_deletion_items i
       SET status='running',attempts=attempts+1,locked_at=now(),lock_token=$1,error_code=NULL
       FROM candidate c WHERE i.request_id=c.request_id AND i.job_id=c.job_id
       RETURNING i.request_id,i.job_id,i.lock_token,i.attempts`, [token],
    );
    return result.rows[0];
  }

  async process(item: DeletionItemRow): Promise<void> {
    try {
      const prefix = `users/${item.job_id}/`;
      const artifacts = await this.db.query<{ bucket: string; object_key: string }>(
        "SELECT bucket,object_key FROM calculation_artifacts WHERE job_id=$1",
        [item.job_id],
      );
      if (artifacts.rows.some((row) => row.bucket !== this.storage.bucket || !row.object_key.startsWith(prefix)))
        throw new Error("unsafe_artifact_key");
      // Включая файлы, загрузка которых завершилась до записи метаданных.
      for await (const object of this.storage.listObjects(prefix)) {
        if (!object.key.startsWith(prefix)) throw new Error("unsafe_artifact_key");
        await this.storage.deleteObject(object.key);
      }
      for await (const _object of this.storage.listObjects(prefix))
        throw new Error("objects_remain");
      await this.db.transaction(async (client) => {
        const claimed = await client.query(
          `SELECT 1 FROM calculation_deletion_items
           WHERE request_id=$1 AND job_id=$2 AND status='running' AND lock_token=$3
           FOR UPDATE`, [item.request_id, item.job_id, item.lock_token],
        );
        if (!claimed.rowCount) return;
        const deleted = await client.query(
          `DELETE FROM calculation_jobs j WHERE j.id=$1
           AND j.deletion_requested_at IS NOT NULL AND j.worker_id IS NULL
           AND j.status IN ('succeeded','failed','cancelled')
           AND NOT EXISTS (SELECT 1 FROM calculation_job_dependencies d WHERE d.source_job_id=j.id)
           RETURNING j.id`, [item.job_id],
        );
        if (!deleted.rowCount) throw new Error("job_blocked");
        await client.query(
          `UPDATE calculation_deletion_items SET status='deleted',locked_at=NULL,
            lock_token=NULL,error_code=NULL WHERE request_id=$1 AND job_id=$2`,
          [item.request_id, item.job_id],
        );
        await client.query(
          `UPDATE calculation_deletion_requests SET deleted_count=deleted_count+1,
            updated_at=now() WHERE id=$1`, [item.request_id],
        );
      });
    } catch (error) {
      const code = error instanceof Error && ["unsafe_artifact_key", "objects_remain", "job_blocked"].includes(error.message)
        ? error.message : "storage_or_database_unavailable";
      const backoffSeconds = Math.min(3600, 5 * 2 ** Math.min(item.attempts, 10));
      await this.db.query(
        `UPDATE calculation_deletion_items SET status='pending',locked_at=NULL,
          lock_token=NULL,error_code=$4,next_attempt_at=now()+($5::integer * interval '1 second')
         WHERE request_id=$1 AND job_id=$2 AND lock_token=$3`,
        [item.request_id, item.job_id, item.lock_token, code, backoffSeconds],
      );
      console.error(`Удаление расчёта ${item.job_id} отложено: ${code}`);
    }
  }

  async pruneCompletedAudit(): Promise<void> {
    await this.db.query(
      `DELETE FROM calculation_deletion_requests
       WHERE deleted_count=requested_count AND updated_at<now()-interval '90 days'`,
    );
  }
}
