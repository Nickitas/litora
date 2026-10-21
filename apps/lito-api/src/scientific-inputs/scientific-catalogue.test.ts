import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { ScientificInputDto } from "@litora/contracts";
import {
  ScientificCatalogueService,
  parseCatalogueSave,
  wholeSeaCatalogueId,
  wholeSeaCatalogueSource,
} from "./scientific-catalogue.service.js";
import type { ScientificInputsRepository } from "./scientific-inputs.repository.js";
import type { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import type { CoastlineValidationService } from "../coastline-validation/coastline-validation.service.js";
import { ScientificInputsController } from "./scientific-inputs.controller.js";
import type { AuthRequest } from "../auth/auth.guard.js";

test("каталог: неизвестная ошибка хранилища возвращается по-русски без внутренних подробностей", async () => {
  const controller = new ScientificInputsController(
    {} as ScientificInputsRepository, {} as ObjectStorageService, {} as CoastlineValidationService,
    { save: async () => { throw new Error("private-storage-error"); } } as unknown as ScientificCatalogueService,
  );
  await assert.rejects(controller.saveCatalogue({ user: { id: "owner" } } as AuthRequest, wholeSeaCatalogueId, { name: "Море" }),
    { status: 503, message: "Не удалось сохранить полный исходник. Обновите список и повторите попытку." });
});

test("каталог полного моря: закреплённые байты, WGS84, лицензия и назначение морской границы", async () => {
  const { entry, bytes } = await wholeSeaCatalogueSource();
  assert.equal(bytes.length, 299701);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  assert.equal(entry.geometryKind, "sea_area_boundary");
  assert.equal(entry.crs, "EPSG:4326");
  assert.equal(entry.coordinateUnit, "degrees");
  assert.equal(entry.license, "CC-BY");
  assert.ok(
    entry.limitations.some((text) => text.includes("не береговая съёмка"))
  );
  await assert.rejects(wholeSeaCatalogueSource("/несуществующий-каталог"));
});

test("каталог принимает только своё название, а не URL, путь, роль и checksum", () => {
  assert.deepEqual(parseCatalogueSave({ name: "  Мой исходник  " }), {
    name: "Мой исходник",
  });
  for (const body of [
    null,
    [],
    "имя",
    {},
    { name: "  " },
    { name: "Я".repeat(101) },
    { name: "Море", url: "https://example.test" },
    { name: "Море", role: "seabed_msh" },
    { name: "Море", path: "../../file" },
    { name: "Море", sha256: "a".repeat(64) },
  ])
    assert.throws(() => parseCatalogueSave(body), { status: 400 });
});

for (const mode of [
  "success",
  "ready",
  "s3-failure",
  "lost-finish-response",
] as const) {
  test(`каталог: владение, повтор и завершение копии — ${mode}`, async () => {
    const { entry, bytes } = await wholeSeaCatalogueSource();
    const owner = "11111111-1111-4111-8111-111111111111";
    const id = "22222222-2222-4222-8222-222222222222";
    const input: ScientificInputDto = {
      ...entry,
      id,
      name: "Имя владельца",
      createdAt: new Date(0).toISOString(),
      status: mode === "ready" ? "ready" : "pending",
      sha256: mode === "ready" ? entry.sha256 : null,
    };
    const events: string[] = [];
    const inputs = {
      create: async (
        user: string,
        value: ScientificInputDto,
        digest: string
      ) => {
        assert.equal(user, owner);
        assert.equal(digest, entry.sha256);
        assert.equal(value.name, "Своё имя");
        events.push("reserve");
        return input;
      },
      beginUpload: async (key: string, user: string) => {
        assert.equal(key, id);
        assert.equal(user, owner);
        events.push("claim");
        return { object_key: "private-owned-object" };
      },
      finishUpload: async (
        key: string,
        user: string,
        objectKey: string,
        hash: string
      ) => {
        assert.equal(key, id);
        assert.equal(user, owner);
        assert.equal(objectKey, "private-owned-object");
        assert.equal(hash, entry.sha256);
        events.push("finish");
        if (mode === "lost-finish-response")
          throw new Error("Ответ БД потерян");
        return { ...input, status: "ready", sha256: hash };
      },
      isReadyObject: async () => mode === "lost-finish-response",
      failUpload: async () => {
        events.push("reset-claim");
      },
    } as unknown as ScientificInputsRepository;
    const storage = {
      uploadBytes: async (key: string, data: Buffer, contentType: string) => {
        assert.equal(key, "private-owned-object");
        assert.deepEqual(data, bytes);
        assert.equal(contentType, "application/geo+json");
        events.push("upload");
        if (mode === "s3-failure") throw new Error("S3 недоступен");
      },
      deleteObject: async (key: string) => {
        assert.equal(key, "private-owned-object");
        events.push("delete");
      },
    } as unknown as ObjectStorageService;
    const validation = {
      state: async () => {
        events.push("state");
        return { status: "succeeded", accepted: true };
      },
      afterSave: async (type: string, key: string, user: string) => {
        assert.equal(type, "scientific");
        assert.equal(key, id);
        assert.equal(user, owner);
        events.push("enqueue");
        return { status: "queued" };
      },
    } as unknown as CoastlineValidationService;
    const service = new ScientificCatalogueService(inputs, storage, validation);
    if (mode === "s3-failure" || mode === "lost-finish-response") {
      await assert.rejects(
        service.save(owner, wholeSeaCatalogueId, { name: "Своё имя" })
      );
      assert.equal(events.includes("delete"), mode === "s3-failure");
      assert.ok(events.includes("reset-claim"));
    } else {
      const result = await service.save(owner, wholeSeaCatalogueId, {
        name: "Своё имя",
      });
      assert.equal(result.id, id);
      assert.equal(result.status, "ready");
      assert.deepEqual(
        events,
        mode === "ready"
          ? ["reserve", "state"]
          : ["reserve", "claim", "upload", "finish", "enqueue"]
      );
    }
    await assert.rejects(service.save(owner, "../../file", { name: "Море" }), {
      status: 404,
    });
  });
}
