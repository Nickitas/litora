import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import * as argon2 from "argon2";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AuthDto, CalculationJobDto, UserDto } from "@litora/contracts";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { CalculationsController } from "../calculations/calculations.controller.js";
import { CalculationsRepository } from "../calculations/calculations.repository.js";
import { configureTrustedProxies } from "../config/trusted-proxies.js";

@Module({})
class SessionTestModule {}

const url = process.env.TEST_DATABASE_URL;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const isStatus = (expected: number) => (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "getStatus" in error &&
    typeof error.getStatus === "function" &&
    error.getStatus() === expected,
  );

test(
  "PostgreSQL/HTTP: сессии и изоляция пользователей",
  { skip: !url },
  async (suite) => {
    assert.match(
      new URL(url!).pathname,
      /^\/litora_test_[a-z0-9_]+$/,
      "Тест разрешён только для выделенной БД litora_test_*",
    );
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      query_timeout: 15000,
    });
    const db = Object.create(DatabaseService.prototype) as DatabaseService;
    Object.defineProperty(db, "pool", { value: pool });
    const auth = new AuthService(db);
    const users: string[] = [];
    const signedKeys: string[] = [];
    const storage = {
      async downloadUrl(key: string) {
        signedKeys.push(key);
        return "https://storage.example.test/test-artifact";
      },
    };
    const password = "test-session-password-2026";
    const rateIp = `2001:db8:${randomUUID().replaceAll("-", "").match(/.{4}/g)!.slice(0, 6).join(":")}`;
    let app: NestExpressApplication | undefined;
    let base = "";
    let passwordHash = "";
    let initialized = false;

    async function user(role = "user"): Promise<UserDto> {
      const email = `${randomUUID()}@example.test`;
      const result = await db.query<{ id: string }>(
        "INSERT INTO users(email,password_hash,display_name,role) VALUES($1,$2,'Тест сессии',$3) RETURNING id",
        [email, passwordHash, role],
      );
      const id = result.rows[0].id;
      users.push(id);
      return { id, email, name: "Тест сессии" };
    }
    const login = (owner: UserDto) =>
      auth.login({ email: owner.email, password });
    const request = (path: string, options: RequestInit = {}) =>
      fetch(`${base}/api/${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": rateIp,
          ...options.headers,
        },
      });
    const bearer = (accessToken: string) => ({
      Authorization: `Bearer ${accessToken}`,
    });
    const cookie = (refreshToken: string) => ({
      Cookie: `litora_refresh=${refreshToken}`,
    });

    try {
      await db.initialize();
      initialized = true;
      passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      app = await NestFactory.create<NestExpressApplication>(
        {
          module: SessionTestModule,
          controllers: [AuthController, CalculationsController],
          providers: [
            { provide: DatabaseService, useValue: db },
            { provide: ObjectStorageService, useValue: storage },
            AuthService,
            AuthGuard,
            CalculationsRepository,
          ],
        },
        { logger: false },
      );
      app.setGlobalPrefix("api");
      configureTrustedProxies(app, ["127.0.0.1/32"]);
      await app.listen(0, "127.0.0.1");
      base = await app.getUrl();

      await suite.test(
        "ошибки входа одинаковы; в БД хеши, DTO пользователя без секретов",
        async () => {
          const owner = await user();
          const errorFor = async (email: string) => {
            const response = await request("auth/login", {
              method: "POST",
              body: JSON.stringify({ email, password: "wrong-password-2026" }),
            });
            assert.equal(response.status, 401);
            return (await response.json()) as { message: string };
          };
          assert.equal(
            (await errorFor(owner.email)).message,
            (await errorFor(`${randomUUID()}@example.test`)).message,
          );
          const session = await login(owner);
          assert.deepEqual(session.body.user, owner);
          assert.deepEqual(Object.keys(session.body.user).sort(), [
            "email",
            "id",
            "name",
          ]);
          const stored = await db.query<{
            password_hash: string;
            refresh_token_hash: string;
            access_token_hash: string;
          }>(
            `SELECT u.password_hash,s.refresh_token_hash,s.access_token_hash FROM users u
         JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1`,
            [owner.id],
          );
          assert.match(stored.rows[0].password_hash, /^\$argon2id\$/);
          assert.equal(
            stored.rows[0].refresh_token_hash,
            digest(session.refreshToken),
          );
          assert.equal(
            stored.rows[0].access_token_hash,
            digest(session.body.accessToken),
          );
          assert.notEqual(stored.rows[0].password_hash, password);
        },
      );

      await suite.test(
        "refresh ротирует оба токена; при конкурентном повторе один победитель",
        async () => {
          const owner = await user();
          const original = await login(owner);
          const lifetime = await db.query<{ expires_at: Date }>(
            "SELECT expires_at FROM auth_sessions WHERE refresh_token_hash=$1",
            [digest(original.refreshToken)],
          );
          const next = await auth.refresh(original.refreshToken);
          const rows = await db.query<{ expires_at: Date }>(
            "SELECT expires_at FROM auth_sessions WHERE refresh_token_hash=$1",
            [digest(next.refreshToken)],
          );
          assert.equal(rows.rowCount, 1);
          assert.equal(
            rows.rows[0].expires_at.toISOString(),
            lifetime.rows[0].expires_at.toISOString(),
          );
          await assert.rejects(
            auth.authenticate(`Bearer ${original.body.accessToken}`),
            isStatus(401),
          );
          await assert.rejects(
            auth.refresh(original.refreshToken),
            isStatus(401),
          );
          assert.deepEqual(
            await auth.authenticate(`Bearer ${next.body.accessToken}`),
            owner,
          );
          const outcomes = await Promise.allSettled([
            auth.refresh(next.refreshToken),
            auth.refresh(next.refreshToken),
          ]);
          assert.equal(
            outcomes.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const loser = outcomes.find((result) => result.status === "rejected");
          assert.ok(
            loser?.status === "rejected" && isStatus(401)(loser.reason),
          );
          const winner = outcomes.find(
            (result) => result.status === "fulfilled",
          );
          assert.ok(winner?.status === "fulfilled");
          assert.deepEqual(
            await auth.authenticate(`Bearer ${winner.value.body.accessToken}`),
            owner,
          );
          await assert.rejects(
            auth.authenticate(`Bearer ${next.body.accessToken}`),
            isStatus(401),
          );
        },
      );

      await suite.test(
        "истечение и logout запрещают доступ, другие сессии сохраняются",
        async () => {
          const owner = await user();
          const expiredAccess = await login(owner);
          await db.query(
            "UPDATE auth_sessions SET access_expires_at=now()-interval '1 minute' WHERE access_token_hash=$1",
            [digest(expiredAccess.body.accessToken)],
          );
          await assert.rejects(
            auth.authenticate(`Bearer ${expiredAccess.body.accessToken}`),
            isStatus(401),
          );
          const renewed = await auth.refresh(expiredAccess.refreshToken);
          assert.deepEqual(
            await auth.authenticate(`Bearer ${renewed.body.accessToken}`),
            owner,
          );
          const expiredSession = await login(owner);
          await db.query(
            "UPDATE auth_sessions SET expires_at=now()-interval '1 minute' WHERE refresh_token_hash=$1",
            [digest(expiredSession.refreshToken)],
          );
          await assert.rejects(
            auth.refresh(expiredSession.refreshToken),
            isStatus(401),
          );
          await assert.rejects(
            auth.authenticate(`Bearer ${expiredSession.body.accessToken}`),
            isStatus(401),
          );
          const independent = await login(owner);
          await auth.logout(renewed.refreshToken);
          await auth.logout(renewed.refreshToken);
          await assert.rejects(
            auth.refresh(renewed.refreshToken),
            isStatus(401),
          );
          await assert.rejects(
            auth.authenticate(`Bearer ${renewed.body.accessToken}`),
            isStatus(401),
          );
          assert.deepEqual(
            await auth.authenticate(`Bearer ${independent.body.accessToken}`),
            owner,
          );
        },
      );

      await suite.test(
        "HTTP me/refresh/logout: cookie, чужой Origin и отозванный bearer",
        async () => {
          const owner = await user();
          const loggedIn = await request("auth/login", {
            method: "POST",
            body: JSON.stringify({ email: owner.email, password }),
          });
          assert.equal(loggedIn.status, 200);
          const loginCookie = loggedIn.headers.get("set-cookie") ?? "";
          assert.match(loginCookie, /HttpOnly/);
          const refreshToken = loginCookie.match(
            /^litora_refresh=([^;]+)/,
          )?.[1];
          assert.ok(refreshToken);
          const session = {
            body: (await loggedIn.json()) as AuthDto,
            refreshToken,
          };
          assert.equal((await request("auth/me")).status, 401);
          assert.equal(
            (
              await request("auth/me", {
                headers: { Authorization: "Basic invalid" },
              })
            ).status,
            401,
          );
          assert.equal(
            (await request("auth/me", { headers: bearer("invalid-token") }))
              .status,
            401,
          );
          assert.equal(
            (await request("auth/me", { headers: bearer("x".repeat(300)) }))
              .status,
            401,
          );
          assert.equal(
            (
              await request("auth/me", {
                headers: bearer(session.body.accessToken),
              })
            ).status,
            200,
          );
          const forbidden = await request("auth/refresh", {
            method: "POST",
            headers: {
              ...cookie(session.refreshToken),
              Origin: "https://untrusted.example",
            },
          });
          assert.equal(forbidden.status, 403);
          const refreshed = await request("auth/refresh", {
            method: "POST",
            headers: cookie(session.refreshToken),
          });
          assert.equal(refreshed.status, 200);
          const setCookie = refreshed.headers.get("set-cookie") ?? "";
          assert.match(setCookie, /HttpOnly/);
          assert.match(setCookie, /SameSite=Strict/);
          assert.match(setCookie, /Path=\/api\/auth/);
          assert.equal(refreshed.headers.get("cache-control"), "no-store");
          const rotated = (await refreshed.json()) as AuthDto;
          assert.equal("refreshToken" in rotated, false);
          assert.equal(
            (
              await request("auth/me", {
                headers: bearer(session.body.accessToken),
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request("auth/refresh", {
                method: "POST",
                headers: cookie(session.refreshToken),
              })
            ).status,
            401,
          );
          const logout = await request("auth/logout", {
            method: "POST",
            headers: { Cookie: setCookie.split(";")[0] },
          });
          assert.equal(logout.status, 200);
          assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
          assert.equal(
            (await request("auth/me", { headers: bearer(rotated.accessToken) }))
              .status,
            401,
          );
        },
      );

      await suite.test(
        "чужой job/admin: 404, без отмены и выдачи signed URL",
        async () => {
          const owner = await user();
          const outsider = await user("admin");
          const own = await login(owner);
          const other = await login(outsider);
          const created = await request("calculations", {
            method: "POST",
            headers: bearer(own.body.accessToken),
            body: JSON.stringify({ kind: "dimension" }),
          });
          assert.equal(created.status, 201);
          const job = (await created.json()) as CalculationJobDto;
          const objectKey = `test/${randomUUID()}/report.json`;
          await db.query(
            `INSERT INTO calculation_artifacts(job_id,filename,bucket,object_key,size_bytes,sha256)
        VALUES($1,'report.json','test-bucket',$2,10,$3)`,
            [job.id, objectKey, "0".repeat(64)],
          );
          const before = signedKeys.length;
          assert.equal(
            (
              await request(`calculations/${job.id}`, {
                headers: bearer(other.body.accessToken),
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request(`calculations/${job.id}/cancel`, {
                method: "POST",
                headers: bearer(other.body.accessToken),
              })
            ).status,
            404,
          );
          assert.equal(signedKeys.length, before);
          const remaining = await db.query<{ status: string }>(
            "SELECT status FROM calculation_jobs WHERE id=$1",
            [job.id],
          );
          assert.equal(remaining.rows[0].status, "queued");
          const foreignList = await request("calculations", {
            headers: bearer(other.body.accessToken),
          });
          assert.equal(foreignList.status, 200);
          assert.deepEqual(await foreignList.json(), []);
          const ownResult = await request(`calculations/${job.id}`, {
            headers: bearer(own.body.accessToken),
          });
          assert.equal(ownResult.status, 200);
          const details = (await ownResult.json()) as CalculationJobDto;
          assert.equal(details.artifacts.length, 1);
          assert.deepEqual(signedKeys.slice(before), [objectKey]);
          assert.equal(
            (
              await request("calculations/not-a-uuid", {
                headers: bearer(own.body.accessToken),
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("calculations", {
                method: "POST",
                headers: bearer(own.body.accessToken),
                body: JSON.stringify({
                  kind: "dimension",
                  userId: outsider.id,
                }),
              })
            ).status,
            400,
          );
        },
      );

      await suite.test(
        "шесть параллельных create дают пять jobs; отмена освобождает квоту",
        async () => {
          const owner = await user();
          const session = await login(owner);
          const create = () =>
            request("calculations", {
              method: "POST",
              headers: bearer(session.body.accessToken),
              body: JSON.stringify({ kind: "map" }),
            });
          const responses = await Promise.all(
            Array.from({ length: 6 }, create),
          );
          assert.equal(
            responses.filter((response) => response.status === 201).length,
            5,
          );
          assert.equal(
            responses.filter((response) => response.status === 409).length,
            1,
          );
          const result = await db.query<{ id: string }>(
            "SELECT id FROM calculation_jobs WHERE user_id=$1 AND status='queued'",
            [owner.id],
          );
          assert.equal(result.rowCount, 5);
          assert.equal(
            (
              await request(`calculations/${result.rows[0].id}/cancel`, {
                method: "POST",
                headers: bearer(session.body.accessToken),
              })
            ).status,
            201,
          );
          assert.equal((await create()).status, 201);
        },
      );
    } finally {
      try {
        if (initialized) {
          // Jobs имеют ON DELETE SET NULL: сначала удаляем только jobs наших fixture-пользователей.
          if (users.length) {
            await db.query(
              "DELETE FROM calculation_jobs WHERE user_id=ANY($1::uuid[])",
              [users],
            );
            await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
              users,
            ]);
          }
          await db.query("DELETE FROM auth_rate_limits WHERE key=$1", [rateIp]);
        }
      } finally {
        if (app) await app.close();
        else await pool.end();
      }
    }
  },
);
