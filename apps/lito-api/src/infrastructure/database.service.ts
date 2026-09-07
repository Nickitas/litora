import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { environment } from "../config/environment.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: environment.databaseUrl });

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const migrationPath = resolve(process.cwd(), "../../infra/postgres/init/001_schema.sql");
    const migration = await readFile(migrationPath, "utf8");
    await this.pool.query(migration);
  }

  query<Row extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

