import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { configureTrustedProxies } from "./config/trusted-proxies.js";
import {
  DocumentBuilder,
  SwaggerModule,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { HealthDto, ReleaseDto } from "@litora/contracts";
import { CalculationsController } from "./calculations/calculations.controller.js";
import { CalculationsRepository } from "./calculations/calculations.repository.js";
import { DatabaseService } from "./infrastructure/database.service.js";
import { ObjectStorageService } from "./infrastructure/object-storage.service.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { environment } from "./config/environment.js";

@Controller()
@ApiTags("system")
class AppController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}
  @ApiOperation({ summary: "Информация об API" })
  @Get()
  root() {
    return {
      service: "lito-api",
      status: "ok",
      endpoints: ["/api/health", "/api/releases/latest"],
    };
  }

  @ApiOperation({ summary: "Проверка состояния API" })
  @Get("health")
  async health(): Promise<HealthDto> {
    try {
      await Promise.all([this.db.query("SELECT 1"), this.storage.check()]);
    } catch {
      throw new ServiceUnavailableException(
        "База данных или хранилище недоступны",
      );
    }
    return { status: "ok", service: "lito-api", version: "0.1.0" };
  }
  @ApiOperation({ summary: "Последний релиз CLI" })
  @Get("releases/latest")
  releases(): ReleaseDto {
    return {
      version: "0.1.0",
      releaseDate: new Date().toISOString().slice(0, 10),
      changelog: [],
      files: [],
    };
  }
}

@Module({
  controllers: [AppController, AuthController, CalculationsController],
  providers: [
    DatabaseService,
    ObjectStorageService,
    CalculationsRepository,
    AuthService,
    AuthGuard,
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureTrustedProxies(app, environment.trustedProxies);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: environment.webOrigin, credentials: true });
  app.enableShutdownHooks();
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Litora API")
    .setDescription("HTTP API проекта Litora для web-приложения и интеграций")
    .setVersion("0.1.0")
    .addBearerAuth()
    .addTag("system")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);
  await app.listen(environment.port, "0.0.0.0");
}
void bootstrap();
