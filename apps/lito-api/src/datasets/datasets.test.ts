import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { Module, UnauthorizedException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthGuard } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import type { DatabaseService } from "../infrastructure/database.service.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import { DatasetsController } from "./datasets.controller.js";
import { DatasetsRepository, type DatasetRow } from "./datasets.repository.js";
import { CoastlineValidationService } from "../coastline-validation/coastline-validation.service.js";
import { unrequestedValidation } from "../coastline-validation/state.js";

const owner = randomUUID(),
  id = randomUUID();
const geometry = {
  type: "LineString",
  coordinates: [
    [39.67, 43.64],
    [39.68, 43.63],
  ],
};
const original = Buffer.from(JSON.stringify(geometry));

function fixture(bytes = original, changes: Partial<DatasetRow> = {}) {
  let reads = 0;
  const row: DatasetRow = {
    id,
    owner_id: owner,
    schema_version: 1,
    name: "Мой берег",
    source: "Тест",
    source_revision: "v2",
    license: "Тестовая",
    crs: "EPSG:4326",
    coordinate_unit: "degrees",
    point_count: 2,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    object_key: `users/${owner}/datasets/${id}.geojson`,
    created_at: new Date(),
    ...changes,
  };
  const db = {
    async query(sql: string, values: unknown[]) {
      assert.match(sql, /WHERE id=\$1 AND owner_id=\$2/);
      return { rows: values[0] === id && values[1] === owner ? [row] : [] };
    },
  } as unknown as DatabaseService;
  const storage = {
    async readObjectBytes(key: string, limit: number) {
      reads += 1;
      assert.equal(key, row.object_key);
      assert.equal(limit, 65_536);
      return bytes;
    },
  } as unknown as ObjectStorageService;
  return {
    repository: new DatasetsRepository(db, storage),
    reads: () => reads,
  };
}

test("HTTP: просмотр и точный экспорт доступны только владельцу", async () => {
  const current = fixture();
  @Module({
    controllers: [DatasetsController],
    providers: [
      AuthGuard,
      { provide: DatasetsRepository, useValue: current.repository },
      { provide: CoastlineValidationService, useValue: {
        async state(_type: string, sourceId: string, userId: string) {
          await current.repository.getOwned(sourceId, userId);
          return unrequestedValidation();
        },
        async enqueue(_type: string, sourceId: string, userId: string) {
          await current.repository.getOwned(sourceId, userId);
          return { ...unrequestedValidation(), jobId: randomUUID(), status: "queued" };
        },
      } },
      {
        provide: AuthService,
        useValue: {
          async authenticate(value: string | undefined) {
            if (value !== "Bearer owner" && value !== "Bearer other")
              throw new UnauthorizedException("Требуется авторизация");
            return {
              id: value === "Bearer owner" ? owner : randomUUID(),
              name: "Тест",
              email: "test@example.test",
            };
          },
        },
      },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix("api");
  try {
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/datasets`;
    const request = (path: string, token?: string, method = "GET") =>
      fetch(`${base}/${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    const detail = await request(id, "owner");
    assert.equal(detail.status, 200);
    assert.equal(detail.headers.get("cache-control"), "private, no-store");
    const payload = await detail.json();
    assert.deepEqual(payload.geometry, geometry);
    for (const field of [
      "object_key",
      "objectKey",
      "owner_id",
      "bucket",
      "downloadUrl",
    ])
      assert.equal(field in payload, false);
    const file = await request(`${id}/content`, "owner");
    assert.equal(file.status, 200);
    assert.match(file.headers.get("content-type")!, /^application\/geo\+json/);
    assert.equal(file.headers.get("cache-control"), "private, no-store");
    assert.equal(
      file.headers.get("content-disposition"),
      `attachment; filename="dataset-${id}.geojson"`,
    );
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), original);
    for (const suffix of ["", "/content", "/validation"]) {
      assert.equal((await request(`${id}${suffix}`)).status, 401);
      const foreign = await request(`${id}${suffix}`, "other");
      const missing = await request(`${randomUUID()}${suffix}`, "owner");
      assert.equal(foreign.status, 404);
      assert.deepEqual(await foreign.json(), await missing.json());
      assert.equal((await request(`not-a-uuid${suffix}`, "owner")).status, 400);
    }
    for (const token of [undefined, "other", "owner"]) {
      const response = await request(`${id}/validation`, token, "POST");
      assert.equal(response.status, !token ? 401 : token === "owner" ? 201 : 404);
      if (token === "owner") assert.equal((await response.json()).status, "queued");
    }
    assert.equal((await request("not-a-uuid/validation", "owner", "POST")).status, 400);
    assert.equal(
      current.reads(),
      2,
      "Чужой, отсутствующий и некорректный UUID не читают S3",
    );
  } finally {
    await app.close();
  }
});

for (const [label, bytes, changes] of [
  ["checksum", original, { sha256: "0".repeat(64) }],
  ["размер", original, { size_bytes: original.length + 1 }],
  ["лимит чтения", Buffer.alloc(65_537), {}],
  ["JSON", Buffer.from("ошибка JSON"), {}],
  ["тип геометрии", Buffer.from('{"type":"Point","coordinates":[39,43]}'), {}],
  ["число точек", original, { point_count: 3 }],
  ["версия схемы", original, { schema_version: 99 }],
] satisfies [string, Buffer, Partial<DatasetRow>][]) {
  test(`повреждённый набор: ${label} не раскрывается клиенту`, async () => {
    const { repository } = fixture(bytes, changes);
    await assert.rejects(repository.readOwned(id, owner), {
      status: 503,
      message:
        "Не удалось прочитать сохранённый набор. Повторите попытку позже.",
    });
  });
}
