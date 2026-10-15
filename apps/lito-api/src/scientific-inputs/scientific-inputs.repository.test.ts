import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseService } from "../infrastructure/database.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";

test("ряд контуров выдаётся только владельцу готового файла нужной роли", async () => {
  const database = {
    query: async (sql: string, params: unknown[]) => {
      assert.match(sql, /owner_id=\$2 AND role='shoreline_timeseries_geojson' AND status='ready'/);
      return { rows: params[0] === "series" && params[1] === "owner"
        ? [{ id: "series", role: "shoreline_timeseries_geojson", status: "ready" }] : [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  assert.equal((await repository.ownedObservedSeries("series", "owner")).id, "series");
  await assert.rejects(repository.ownedObservedSeries("series", "other"));
});

test("повторная загрузка получает новый ключ, а завершение проверяет именно его", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const database = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT id FROM scientific_inputs")) return { rows: [{ id: "input" }] };
      if (sql.startsWith("UPDATE scientific_inputs SET status='uploading'"))
        return { rows: [{ id: "input", object_key: params[2] }] };
      if (sql.startsWith("UPDATE scientific_inputs SET status='ready'"))
        return { rows: [{ id: "input", object_key: params[2], created_at: new Date(), size_bytes: "1" }] };
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  const first = await repository.beginUpload("input", "owner");
  const second = await repository.beginUpload("input", "owner");
  assert.notEqual(first.object_key, second.object_key);
  assert.match(first.object_key, /^users\/owner\/scientific-inputs\/input\//);
  await repository.finishUpload("input", "owner", second.object_key, "a".repeat(64));
  assert.match(calls.at(-1)!.sql, /object_key=\$3 AND status='uploading'/);
  assert.equal(calls.at(-1)!.params[2], second.object_key);
});

test("волновой ряд доступен worker только владельцу и с нужной ролью", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const database = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT * FROM scientific_inputs") &&
          params[0] === "wave-id" && params[1] === "owner" && params[2] === "wave_climate")
        return { rows: [{ id: "wave-id", role: "wave_climate", sha256: "a".repeat(64), filename: "waves.csv", source: "Наблюдения" }] };
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  assert.equal((await repository.resolveOwnedSource("wave-id", "owner", "wave_climate", "private")).origin, "upload");
  await assert.rejects(repository.resolveOwnedSource("wave-id", "other", "wave_climate", "private"));
  await assert.rejects(repository.resolveOwnedSource("wave-id", "owner", "coastline_geojson", "private"));
  assert.match(calls[0].sql, /owner_id=\$2 AND role=\$3 AND status='ready'/);
});

test("наблюдения калибровки доступны только владельцу и с ролью наблюдений", async () => {
  const database = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT * FROM scientific_inputs") &&
          params[0] === "observations-id" && params[1] === "owner" &&
          params[2] === "shoreline_observations_json")
        return { rows: [{ id: "observations-id", role: "shoreline_observations_json",
          sha256: "a".repeat(64), filename: "rates.json", source: "Независимая съёмка" }] };
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  assert.equal((await repository.resolveOwnedSource("observations-id", "owner", "shoreline_observations_json", "private")).origin, "upload");
  await assert.rejects(repository.resolveOwnedSource("observations-id", "other", "shoreline_observations_json", "private"));
  await assert.rejects(repository.resolveOwnedSource("observations-id", "owner", "wave_climate", "private"));
});

test("индексные профили CERC не подменяются файлом другой роли или владельца", async () => {
  const database = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT * FROM scientific_inputs") && params[1] === "owner" &&
          params[0] === "profile-id" && params[2] === "longshore_structures_json")
        return { rows: [{ id: "profile-id", role: "longshore_structures_json",
          sha256: "a".repeat(64), filename: "structures.json", source: "Обследование" }] };
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const repository = new ScientificInputsRepository(database);
  assert.equal((await repository.resolveOwnedSource("profile-id", "owner", "longshore_structures_json", "private")).origin, "upload");
  await assert.rejects(repository.resolveOwnedSource("profile-id", "other", "longshore_structures_json", "private"));
  await assert.rejects(repository.resolveOwnedSource("profile-id", "owner", "longshore_sediment_sources_json", "private"));
});
