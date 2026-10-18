interface PresenceDatabase {
  query(sql: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
}

/** WorkerPresence регистрирует heartbeat отдельного процесса, включая простой. */
export class WorkerPresence {
  constructor(
    private readonly db: PresenceDatabase,
    private readonly id: string,
    private readonly profile: "standard" | "heavy"
  ) {}

  async register(): Promise<void> {
    await this.db.query(
      `INSERT INTO worker_instances(id, resource_profile) VALUES ($1, $2)`,
      [this.id, this.profile]
    );
    await this.db.query(
      `DELETE FROM worker_instances WHERE
       (stopped_at IS NOT NULL AND stopped_at < now()-interval '7 days') OR
       (stopped_at IS NULL AND last_seen_at < now()-interval '7 days')`
    );
  }

  async heartbeat(): Promise<void> {
    const result = await this.db.query(
      `UPDATE worker_instances SET last_seen_at=now()
       WHERE id=$1 AND stopped_at IS NULL`,
      [this.id]
    );
    if (result.rowCount !== 1)
      throw new Error("Регистрация worker потеряна");
  }

  async stop(): Promise<void> {
    await this.db.query(
      `UPDATE worker_instances SET stopped_at=now() WHERE id=$1 AND stopped_at IS NULL`,
      [this.id]
    );
  }
}
