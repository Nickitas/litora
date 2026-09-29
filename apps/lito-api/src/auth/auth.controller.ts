import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { AuthGuard, type AuthRequest } from "./auth.guard.js";
import { environment } from "../config/environment.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { AuthResponse, UserResponse } from "../http-models.js";

interface CookieResponse {
  setHeader(name: string, value: string): void;
}
const credentialsSchema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: {
      type: "string",
      format: "email",
      example: "researcher@example.com",
    },
    password: {
      type: "string",
      minLength: 10,
      maxLength: 128,
      example: "example-password-2026",
    },
  },
} as const;

@Controller("auth")
@ApiTags("Авторизация")
@ApiResponse({
  status: 429,
  description: "Более 30 auth POST-запросов за минуту на IP; повторите после Retry-After",
  headers: { "Retry-After": { schema: { type: "integer", minimum: 1, maximum: 60 } } },
})
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private async check(origin: string | undefined, ip: string, res: CookieResponse) {
    if (
      origin &&
      ![environment.webOrigin, environment.apiOrigin].includes(origin)
    )
      throw new ForbiddenException("Недопустимый источник запроса");
    const result = await this.db.query<{ attempts: number; retry_after: number }>(
      `INSERT INTO auth_rate_limits(key,window_start,attempts) VALUES($1,date_trunc('minute',now()),1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_start=date_trunc('minute',now()) THEN LEAST(auth_rate_limits.attempts+1,31) ELSE 1 END,
      window_start=date_trunc('minute',now()) RETURNING attempts,
      GREATEST(1,ceil(extract(epoch FROM (window_start+interval '1 minute'-now()))))::int AS retry_after`,
      [ip],
    );
    if (result.rows[0].attempts > 30) {
      res.setHeader("Retry-After", String(result.rows[0].retry_after));
      res.setHeader("Cache-Control", "no-store");
      throw new HttpException("Слишком много попыток. Подождите минуту", 429);
    }
  }
  private cookie(res: CookieResponse, value: string, clear = false) {
    res.setHeader(
      "Set-Cookie",
      `litora_refresh=${value}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=${clear ? 0 : 2592000}${environment.secureCookies ? "; Secure" : ""}`,
    );
    res.setHeader("Cache-Control", "no-store");
  }
  private refreshToken(cookie = "") {
    return (
      cookie
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("litora_refresh="))
        ?.slice(15) ?? ""
    );
  }

  @Post("register")
  @ApiOperation({ summary: "Создать пользователя и сессию по одноразовому приглашению" })
  @ApiBody({
    schema: {
      ...credentialsSchema,
      required: ["email", "password", "name", "invitationCode"],
      properties: {
        ...credentialsSchema.properties,
        name: { type: "string", maxLength: 100, example: "Исследователь" },
        invitationCode: {
          type: "string",
          pattern: "^litora_[A-Za-z0-9_-]{43}$",
          writeOnly: true,
          description: "Одноразовый ключ от оператора платформы",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    type: AuthResponse,
    description:
      "Пользователь, accessToken (15 минут); refresh-сессия в HttpOnly cookie",
  })
  @ApiResponse({ status: 400, description: "Нет ключа или некорректные поля регистрации" })
  @ApiResponse({ status: 403, description: "Приглашение недействительно или истекло" })
  @ApiResponse({ status: 409, description: "Почта уже зарегистрирована; ключ не погашается" })
  async register(
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Req() req: { ip: string },
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    await this.check(origin, req.ip, res);
    const session = await this.auth.register(body);
    this.cookie(res, session.refreshToken);
    return session.body;
  }
  @Post("login")
  @HttpCode(200)
  @ApiResponse({ status: 200, type: AuthResponse })
  @ApiOperation({ summary: "Войти" })
  @ApiBody({
    schema: { ...credentialsSchema, required: ["email", "password"] },
  })
  async login(
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Req() req: { ip: string },
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    await this.check(origin, req.ip, res);
    const session = await this.auth.login(body);
    this.cookie(res, session.refreshToken);
    return session.body;
  }
  @Post("refresh")
  @HttpCode(200)
  @ApiResponse({ status: 200, type: AuthResponse })
  @ApiOperation({
    summary: "Обновить access token и ротировать refresh cookie",
  })
  async refresh(
    @Headers("cookie") cookie: string,
    @Headers("origin") origin: string | undefined,
    @Req() req: { ip: string },
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    await this.check(origin, req.ip, res);
    const session = await this.auth.refresh(this.refreshToken(cookie));
    this.cookie(res, session.refreshToken);
    return session.body;
  }
  @Post("logout")
  @HttpCode(200)
  @ApiOperation({ summary: "Отозвать текущую сессию" })
  async logout(
    @Headers("cookie") cookie: string,
    @Headers("origin") origin: string | undefined,
    @Req() req: { ip: string },
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    await this.check(origin, req.ip, res);
    await this.auth.logout(this.refreshToken(cookie));
    this.cookie(res, "", true);
    return { ok: true };
  }
  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: UserResponse })
  @ApiOperation({ summary: "Текущий пользователь" })
  me(@Req() req: AuthRequest) {
    return req.user;
  }
}
