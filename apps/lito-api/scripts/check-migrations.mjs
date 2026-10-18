import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("Задайте TEST_DATABASE_URL локальной тестовой БД litora_test_*");
}

const url = new URL(testUrl);
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/litora_test_[a-z0-9_]+$/.test(url.pathname)
) {
  throw new Error("Проверка миграций разрешена только на localhost и БД litora_test_*");
}

const migrationsDirectory = fileURLToPath(
  new URL("../../../infra/postgres/init/", import.meta.url),
);
const expectedMigrations = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
assert.ok(expectedMigrations.length > 0, "Не найдены SQL-миграции");

const databaseName = `litora_test_migrations_${randomUUID().replaceAll("-", "")}`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new Pool({ connectionString: adminUrl.toString() });
let created = false;

try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;

  const isolatedUrl = new URL(url);
  isolatedUrl.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = isolatedUrl.toString();
  process.env.LITORA_MIGRATIONS_DIR = migrationsDirectory;
  const databaseModule = await import("../src/infrastructure/database.service.ts");
  const { DatabaseService } = databaseModule.default ?? databaseModule;

  const fresh = new DatabaseService();
  let userId;
  try {
    const before = await fresh.query("SELECT to_regclass('public.schema_migrations') AS table_name");
    assert.equal(before.rows[0].table_name, null, "Тестовая БД не была пустой");

    await fresh.initialize();
    const applied = await fresh.query("SELECT name FROM schema_migrations ORDER BY name");
    assert.deepEqual(applied.rows.map((row) => row.name), expectedMigrations);

    const inserted = await fresh.query(
      "INSERT INTO users(email,password_hash,display_name) VALUES ($1,$2,$3) RETURNING id",
      [`${randomUUID()}@example.test`, "test-only", "Проверка миграций"],
    );
    userId = inserted.rows[0].id;
  } finally {
    await fresh.onModuleDestroy();
  }

  const reused = new DatabaseService();
  try {
    const snapshot = async () => ({
      migrations: (
        await reused.query("SELECT name, applied_at FROM schema_migrations ORDER BY name")
      ).rows,
      objects: (
        await reused.query(
          "SELECT relname, relkind FROM pg_class WHERE relnamespace = 'public'::regnamespace ORDER BY relname, relkind",
        )
      ).rows,
      user: (
        await reused.query("SELECT id, display_name FROM users WHERE id = $1", [userId])
      ).rows,
    });
    const before = await snapshot();
    await reused.initialize();
    const after = await snapshot();
    assert.deepEqual(after, before, "Повторная инициализация изменила схему или данные");
    assert.equal(after.user.length, 1, "Контрольная запись пользователя исчезла");
    assert.equal(after.migrations.length, expectedMigrations.length);
    console.log(`Миграции: ${expectedMigrations.length}; повторный запуск без изменений`);
  } finally {
    await reused.onModuleDestroy();
  }
} finally {
  try {
    if (created) await admin.query(`DROP DATABASE ${databaseName}`);
  } finally {
    await admin.end();
  }
}
