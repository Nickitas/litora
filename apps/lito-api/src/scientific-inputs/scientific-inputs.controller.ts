import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnsupportedMediaTypeException,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthGuard, type AuthRequest } from "../auth/auth.guard.js";
import { ReusableScientificArtifactResponse, ScientificInputResponse } from "../http-models.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";
import { validateScientificInput } from "./validation.js";

@Controller("scientific-inputs")
@ApiTags("Научные входные файлы")
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class ScientificInputsController {
  constructor(
    @Inject(ScientificInputsRepository)
    private readonly inputs: ScientificInputsRepository,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Список своих научных файлов" })
  @ApiResponse({ status: 200, type: [ScientificInputResponse] })
  list(@Req() req: AuthRequest) {
    return this.inputs.list(req.user.id);
  }

  @Get("reusable-artifacts")
  @ApiOperation({ summary: "Совместимые артефакты своих успешных расчётов для следующего сценария" })
  @ApiResponse({ status: 200, type: [ReusableScientificArtifactResponse] })
  reusableArtifacts(@Req() req: AuthRequest) {
    return this.inputs.listReusableArtifacts(req.user.id, this.storage.bucket);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить только незавершённую загрузку своего файла" })
  @ApiResponse({ status: 200, description: "Незавершённая запись удалена" })
  deletePending(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.inputs.deletePending(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: "Зарезервировать приватный научный файл" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "role", "filename", "sizeBytes", "source", "license", "crs", "coordinateUnit"],
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: 100 },
        role: { type: "string", enum: ["coastline_geojson", "flat_mesh_msh", "seabed_msh", "bathymetry_grid_json", "bathymetry_grid_metadata_json", "relief_reference_passport_json", "export_metadata_json", "bathymetry_source_json", "adaptive_field_csv", "adaptive_field_report_json"] },
        filename: { type: "string", maxLength: 160 },
        sizeBytes: { type: "integer", minimum: 1, maximum: 536870912 },
        source: { type: "string", maxLength: 200 },
        sourceRevision: { type: "string", maxLength: 120 },
        license: { type: "string", maxLength: 100 },
        crs: { type: "string", enum: ["EPSG:4326", "LAEA", "not-applicable"] },
        coordinateUnit: { type: "string", enum: ["degrees", "meters", "not-applicable"] },
      },
    },
  })
  @ApiResponse({ status: 201, type: ScientificInputResponse, description: "Создано описание со статусом pending" })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.inputs.create(req.user.id, validateScientificInput(body));
  }

  @Put(":id/content")
  @ApiOperation({ summary: "Загрузить содержимое файла одним потоком; SHA-256 рассчитывает сервер" })
  @ApiConsumes("application/octet-stream")
  @ApiBody({ schema: { type: "string", format: "binary" } })
  @ApiResponse({ status: 200, type: ScientificInputResponse, description: "Файл готов для расчётов" })
  @Header("Cache-Control", "no-store")
  async upload(
    @Req() req: AuthRequest & IncomingMessage,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    if (req.headers["content-type"]?.split(";", 1)[0] !== "application/octet-stream")
      throw new UnsupportedMediaTypeException("Ожидается application/octet-stream");
    const record = await this.inputs.beginUpload(id, req.user.id);
    let directory: string | undefined;
    const expected = Number(record.size_bytes);
    const hash = createHash("sha256");
    let count = 0;
    let uploaded = false;
    try {
      directory = await mkdtemp(join(tmpdir(), "litora-input-"));
      const path = join(directory, "content");
      if (req.headers["content-length"] && Number(req.headers["content-length"]) !== expected)
        throw new BadRequestException("Размер файла не совпадает с описанием");
      const countAndHash = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          count += chunk.length;
          if (count > expected) {
            callback(new BadRequestException("Файл превышает заявленный размер"));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(req, countAndHash, createWriteStream(path, { flags: "wx", mode: 0o600 }));
      if (count !== expected)
        throw new BadRequestException("Файл передан не полностью");
      const handle = await open(path, "r");
      const probe = Buffer.alloc(256);
      const { bytesRead } = await handle.read(probe, 0, probe.length, 0);
      await handle.close();
      const prefix = probe.subarray(0, bytesRead).toString("utf8").trimStart();
      if ((record.role === "seabed_msh" || record.role === "flat_mesh_msh") && !prefix.startsWith("$MeshFormat"))
        throw new BadRequestException("Ожидается файл MSH с заголовком $MeshFormat");
      if (record.role.endsWith("json") || record.role === "coastline_geojson") {
        if (!prefix.startsWith("{") && !prefix.startsWith("["))
          throw new BadRequestException("Ожидается JSON или GeoJSON");
      }
      const contentType = record.role === "seabed_msh" || record.role === "flat_mesh_msh"
        ? "application/octet-stream"
        : record.role === "adaptive_field_csv"
          ? "text/csv"
          : "application/json";
      await this.storage.uploadFile(record.object_key, path, contentType);
      uploaded = true;
      return await this.inputs.finishUpload(id, req.user.id, record.object_key, hash.digest("hex"));
    } catch (error) {
      if (uploaded) {
        const ready = await this.inputs.isReadyObject(id, req.user.id, record.object_key)
          .catch(() => true);
        if (!ready) await this.storage.deleteObject(record.object_key).catch(() => undefined);
      }
      await this.inputs.failUpload(id, req.user.id, record.object_key).catch(() => undefined);
      throw error;
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
