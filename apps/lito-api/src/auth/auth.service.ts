import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import type {
  AuthDto,
  LoginDto,
  RegisterDto,
  UserDto,
} from "@litora/contracts";
import { DatabaseService } from "../infrastructure/database.service.js";
import { invitationDigest, validateInvitationCode } from "./invitations.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
};
const userDto = (row: UserRow): UserDto => ({
  id: row.id,
  email: row.email,
  name: row.display_name,
});

export function validateCredentials(
  body: unknown,
  register = false,
): LoginDto & { name?: string; invitationCode?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Ожидается объект с данными входа");
  const data = body as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        !["email", "password", ...(register ? ["name", "invitationCode"] : [])].includes(key),
    )
  )
    throw new BadRequestException("Неизвестные поля");
  if (
    typeof data.email !== "string" ||
    data.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())
  )
    throw new BadRequestException("Укажите корректную почту");
  if (
    typeof data.password !== "string" ||
    data.password.length < 10 ||
    data.password.length > 128
  )
    throw new BadRequestException(
      "Пароль должен содержать от 10 до 128 символов",
    );
  if (
    register &&
    (typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 100)
  )
    throw new BadRequestException("Имя должно содержать от 1 до 100 символов");
  return {
    email: data.email.trim().toLowerCase(),
    password: data.password,
    ...(register ? {
      name: (data.name as string).trim(),
      invitationCode: validateInvitationCode(data.invitationCode),
    } : {}),
  };
}

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async register(body: unknown) {
    const data = validateCredentials(body, true) as RegisterDto;
    const hash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    try {
      return await this.db.transaction(async (client) => {
        const invitation = await client.query<{ id: string }>(
          `UPDATE registration_invitations SET used_at=clock_timestamp()
           WHERE code_hash=$1 AND used_at IS NULL AND revoked_at IS NULL
             AND expires_at>clock_timestamp() RETURNING id`,
          [invitationDigest(data.invitationCode)],
        );
        if (!invitation.rows[0])
          throw new ForbiddenException("Приглашение недействительно или срок его действия истёк");
        const result = await client.query<UserRow>(
          "INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING *",
          [data.email, hash, data.name],
        );
        await client.query(
          "UPDATE registration_invitations SET used_by=$2 WHERE id=$1",
          [invitation.rows[0].id, result.rows[0].id],
        );
        return this.issue(result.rows[0], client);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException(
          "Пользователь с этой почтой уже существует",
        );
      throw error;
    }
  }

  async login(body: unknown) {
    const data = validateCredentials(body);
    const result = await this.db.query<UserRow>(
      "SELECT * FROM users WHERE email=$1",
      [data.email],
    );
    const row = result.rows[0];
    if (!row || !(await argon2.verify(row.password_hash, data.password)))
      throw new UnauthorizedException("Неверная почта или пароль");
    return this.issue(row);
  }

  private async issue(user: UserRow, database: Pick<DatabaseService, "query"> = this.db) {
    const accessToken = token(),
      refreshToken = token();
    await database.query(
      `INSERT INTO auth_sessions(user_id,refresh_token_hash,access_token_hash,access_expires_at,expires_at)
      VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '30 days')`,
      [user.id, digest(refreshToken), digest(accessToken)],
    );
    return {
      body: {
        user: userDto(user),
        accessToken,
        expiresIn: 900,
      } satisfies AuthDto,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    const nextRefresh = token(),
      accessToken = token();
    const result = await this.db.query<UserRow>(
      `WITH rotated AS (
      UPDATE auth_sessions SET refresh_token_hash=$2, access_token_hash=$3, access_expires_at=now()+interval '15 minutes'
      WHERE refresh_token_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING user_id
    ) SELECT u.* FROM users u JOIN rotated r ON u.id=r.user_id`,
      [digest(refreshToken), digest(nextRefresh), digest(accessToken)],
    );
    if (!result.rows[0])
      throw new UnauthorizedException("Сессия истекла. Войдите снова");
    return {
      body: {
        user: userDto(result.rows[0]),
        accessToken,
        expiresIn: 900,
      } satisfies AuthDto,
      refreshToken: nextRefresh,
    };
  }

  async authenticate(authorization?: string): Promise<UserDto> {
    if (!authorization?.startsWith("Bearer ") || authorization.length > 256)
      throw new UnauthorizedException("Необходим вход");
    const result = await this.db.query<UserRow>(
      `SELECT u.* FROM users u JOIN auth_sessions s ON s.user_id=u.id
      WHERE s.access_token_hash=$1 AND s.revoked_at IS NULL AND s.access_expires_at>now() AND s.expires_at>now()`,
      [digest(authorization.slice(7))],
    );
    if (!result.rows[0])
      throw new UnauthorizedException("Сессия истекла. Войдите снова");
    return userDto(result.rows[0]);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db.query(
      "UPDATE auth_sessions SET revoked_at=now() WHERE refresh_token_hash=$1",
      [digest(refreshToken)],
    );
  }
}
