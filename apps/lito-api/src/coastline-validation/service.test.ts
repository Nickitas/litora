import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { DatabaseService } from "../infrastructure/database.service.js";
import type { DatasetsRepository } from "../datasets/datasets.repository.js";
import type { ScientificInputsRepository } from "../scientific-inputs/scientific-inputs.repository.js";
import type { CalculationsRepository } from "../calculations/calculations.repository.js";
import { CoastlineValidationService } from "./coastline-validation.service.js";

const id = "33333333-3333-4333-8333-333333333333";
function fixture(
  options: { status?: string; role?: string; fullQueue?: boolean } = {},
) {
  let created = 0,
    reads = 0;
  const owned = async (_id: string, user: string) => {
    if (user !== "owner") throw new NotFoundException("Источник не найден");
    return {
      id,
      sha256: "a".repeat(64),
      status: options.status ?? "ready",
      role: options.role ?? "coastline_geojson",
    };
  };
  const db = {
    async query() {
      reads += 1;
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const datasets = { getOwned: owned } as unknown as DatasetsRepository;
  const inputs = {
    ownedCoastline: owned,
  } as unknown as ScientificInputsRepository;
  const jobs = {
    async create(user: string, job: { kind: string; input: unknown }) {
      assert.equal(user, "owner");
      assert.equal(job.kind, "dataset_validation");
      assert.deepEqual(job.input, { datasetId: id });
      created += 1;
      if (options.fullQueue)
        throw new ConflictException("Уже есть 5 незавершённых расчётов");
    },
  } as unknown as CalculationsRepository;
  return {
    service: new CoastlineValidationService(db, datasets, inputs, jobs),
    counts: () => ({ created, reads }),
  };
}

test("чужой источник не создаёт задания и не читает отчёты", async () => {
  const { service, counts } = fixture();
  for (const type of ["dataset", "scientific"] as const) {
    await assert.rejects(service.state(type, id, "other"), NotFoundException);
    await assert.rejects(service.enqueue(type, id, "other"), NotFoundException);
  }
  assert.deepEqual(counts(), { created: 0, reads: 0 });
});

test("сбой очереди оставляет сохранённый набор и даёт понятное состояние для повтора", async () => {
  const { service, counts } = fixture({ fullQueue: true });
  const state = await service.afterSave("dataset", id, "owner");
  assert.equal(state.status, "not_requested");
  assert.equal(state.accepted, null);
  assert.match(state.message!, /5 незавершённых/);
  await assert.rejects(
    service.enqueue("dataset", id, "owner"),
    ConflictException,
  );
  assert.equal(counts().created, 2);
});

test("научная проверка требует готовый контур правильной роли", async () => {
  for (const status of ["pending", "uploading", "failed"]) {
    const { service } = fixture({ status });
    await assert.rejects(
      service.enqueue("scientific", id, "owner"),
      ConflictException,
    );
  }
  await assert.rejects(
    fixture({ role: "wave_climate" }).service.state("scientific", id, "owner"),
    NotFoundException,
  );
});
