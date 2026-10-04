import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { configureTrustedProxies } from "../config/trusted-proxies.js";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { createInvitationCode, invitationDigest } from "./invitations.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";

@Module({})
class InvitationTestModule {}

const url = process.env.TEST_DATABASE_URL;

test("PostgreSQL: приглашения, конкуренция и атомарный откат", { skip: !url }, async () => {
  assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/,
    "Тест разрешён только для выделенной БД litora_test_*");
  const pool = new Pool({ connectionString: url });
  const db = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(db, "pool", { value: pool });
  const auth = new AuthService(db);
  let app: NestExpressApplication | undefined;
  const password = "test-long-password";
  const body = (invitationCode: string, email = `${randomUUID()}@example.test`, name = "Тест") =>
    ({ email, password, name, invitationCode });
  const status = (code: number) => (error: unknown) =>
    Boolean(error && typeof error === "object" && "getStatus" in error &&
      typeof error.getStatus === "function" && error.getStatus() === code);

  async function invite(expired = false, revoked = false) {
    const code = createInvitationCode();
    await db.query(
      `INSERT INTO registration_invitations(code_hash,created_at,expires_at,revoked_at)
       VALUES($1,now()-interval '2 days',
         CASE WHEN $2 THEN now()-interval '1 day' ELSE now()+interval '1 hour' END,
         CASE WHEN $3 THEN now() ELSE NULL END)`,
      [invitationDigest(code), expired, revoked],
    );
    return code;
  }

  try {
    await db.initialize();
    await assert.rejects(auth.register(body(createInvitationCode())), status(403));
    await assert.rejects(auth.register(body(await invite(true))), status(403));
    await assert.rejects(auth.register(body(await invite(false, true))), status(403));

    const code = await invite();
    const registered = await auth.register(body(code));
    const row = await db.query<{ code_hash: string; used_by: string; used_at: Date }>(
      "SELECT code_hash,used_by,used_at FROM registration_invitations WHERE code_hash=$1",
      [invitationDigest(code)],
    );
    assert.equal(row.rows[0].used_by, registered.body.user.id);
    assert.ok(row.rows[0].used_at);
    assert.notEqual(row.rows[0].code_hash, code);
    await assert.rejects(auth.register(body(code)), status(403));

    const duplicateCode = await invite();
    await assert.rejects(auth.register(body(duplicateCode, registered.body.user.email)), status(409));
    await auth.register(body(duplicateCode));

    const raceCode = await invite();
    const outcomes = await Promise.allSettled([auth.register(body(raceCode)), auth.register(body(raceCode))]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    const loser = outcomes.find((result) => result.status === "rejected");
    assert.ok(loser?.status === "rejected" && status(403)(loser.reason));

    // Инъекция ошибки только в выделенной тестовой БД: проверяем откат session/user/claim.
    await db.query(`CREATE OR REPLACE FUNCTION litora_test_fail_session() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND display_name='fail-session')
        THEN RAISE EXCEPTION 'test session failure'; END IF; RETURN NEW; END $$`);
    await db.query("DROP TRIGGER IF EXISTS litora_test_fail_session ON auth_sessions");
    await db.query(`CREATE TRIGGER litora_test_fail_session BEFORE INSERT ON auth_sessions
      FOR EACH ROW EXECUTE FUNCTION litora_test_fail_session()`);
    const rollbackCode = await invite();
    const rollbackEmail = `${randomUUID()}@example.test`;
    await assert.rejects(auth.register(body(rollbackCode, rollbackEmail, "fail-session")));
    assert.equal((await db.query("SELECT 1 FROM users WHERE email=$1", [rollbackEmail])).rowCount, 0);
    await auth.register(body(rollbackCode, rollbackEmail));

    app = await NestFactory.create<NestExpressApplication>({
      module: InvitationTestModule,
      controllers: [AuthController],
      providers: [{ provide: DatabaseService, useValue: db }, AuthService, AuthGuard],
    }, { logger: false });
    app.setGlobalPrefix("api");
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const registrationSchema = document.paths["/api/auth/register"].post?.requestBody;
    assert.ok(registrationSchema && "content" in registrationSchema);
    const schema = registrationSchema.content["application/json"].schema;
    assert.ok(schema && "required" in schema && schema.required?.includes("invitationCode"));
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const request = (path: string, data: unknown) => fetch(`${base}/api/auth/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const httpCode = await invite();
    const httpBody = body(httpCode);
    const { invitationCode: _code, ...missingCode } = httpBody;
    assert.equal((await request("register", missingCode)).status, 400);
    assert.equal((await request("register", body(createInvitationCode()))).status, 403);
    const registeredResponse = await request("register", httpBody);
    assert.equal(registeredResponse.status, 201);
    assert.match(registeredResponse.headers.get("set-cookie") ?? "", /HttpOnly/);
    const payload = await registeredResponse.json() as Record<string, unknown>;
    assert.ok(payload.accessToken);
    assert.equal(payload.invitationCode, undefined);
    assert.equal((await request("register", body(httpCode))).status, 403);
    assert.equal((await request("login", { email: httpBody.email, password })).status, 200);

    configureTrustedProxies(app, ["127.0.0.1/32"]);
    const clientIp = `2001:db8:${randomUUID().replaceAll("-", "").match(/.{4}/g)!.slice(0, 6).join(":")}`;
    const anotherIp = `2001:db8:${randomUUID().replaceAll("-", "").match(/.{4}/g)!.slice(0, 6).join(":")}`;
    const rateRequest = (ip: string, origin?: string) => fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip,
        ...(origin ? { Origin: origin } : {}) },
      body: "{}",
    });
    // Счётчик 30 имитирует первые 30 запросов в текущей минуте.
    await db.query(`INSERT INTO auth_rate_limits(key,window_start,attempts)
      VALUES($1,date_trunc('minute',now()),30)`, [clientIp]);
    const limited = await rateRequest(`198.51.100.99, ${clientIp}`);
    assert.equal(limited.status, 429);
    const retryAfter = Number(limited.headers.get("retry-after"));
    assert.ok(retryAfter >= 1 && retryAfter <= 60);
    assert.equal(limited.headers.get("cache-control"), "no-store");
    assert.equal((await rateRequest(anotherIp)).status, 400);
    const attempts = await db.query<{ attempts: number }>(
      "SELECT attempts FROM auth_rate_limits WHERE key=$1", [clientIp]);
    assert.equal(attempts.rows[0].attempts, 31);
    assert.equal((await rateRequest(anotherIp, "https://untrusted.example")).status, 403);
    const originAttempts = await db.query<{ attempts: number }>(
      "SELECT attempts FROM auth_rate_limits WHERE key=$1", [anotherIp]);
    assert.equal(originAttempts.rows[0].attempts, 1);
    await db.query(`UPDATE auth_rate_limits SET window_start=now()-interval '2 minutes'
      WHERE key=$1`, [clientIp]);
    assert.equal((await rateRequest(clientIp)).status, 400);
    const reset = await db.query<{ attempts: number }>(
      "SELECT attempts FROM auth_rate_limits WHERE key=$1", [clientIp]);
    assert.equal(reset.rows[0].attempts, 1);
  } finally {
    if (app) await app.close();
    else await pool.end();
  }
});
