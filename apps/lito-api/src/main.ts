import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { HealthDto, ReleaseDto } from "@litora/contracts";
import { CalculationsController } from "./calculations/calculations.controller.js";
import { CalculationsRepository } from "./calculations/calculations.repository.js";
import { DatabaseService } from "./infrastructure/database.service.js";
import { ObjectStorageService } from "./infrastructure/object-storage.service.js";

@Controller()
@ApiTags("system")
class AppController {
  @ApiOperation({ summary: "Информация об API" })
  @Get() root() {
    return { service: "lito-api", status: "ok", endpoints: ["/api/health", "/api/releases/latest"] };
  }

  @ApiOperation({ summary: "Проверка состояния API" })
  @Get("health") health(): HealthDto { return { status: "ok", service: "lito-api", version: "0.1.0" }; }
  @ApiOperation({ summary: "Последний релиз CLI" })
  @Get("releases/latest") releases(): ReleaseDto { return { version: "0.1.0", releaseDate: new Date().toISOString().slice(0, 10), changelog: [], files: [] }; }
}

@Module({
  controllers: [AppController, CalculationsController],
  providers: [DatabaseService, ObjectStorageService, CalculationsRepository],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors();
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Litora API")
    .setDescription("HTTP API проекта Litora для web-приложения и интеграций")
    .setVersion("0.1.0")
    .addTag("system")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
