import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import { environment } from "../config/environment.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: environment.databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });

  async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const directory = resolve(
      process.env.LITORA_MIGRATIONS_DIR ??
        resolve(process.cwd(), "../../infra/postgres/init"),
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(7301901)");
      await client.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const name of (await readdir(directory))
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        const applied = await client.query(
          "SELECT 1 FROM schema_migrations WHERE name=$1",
          [name],
        );
        if (applied.rowCount) continue;
        await client.query(await readFile(resolve(directory, name), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [
          name,
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  query<Row extends QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
