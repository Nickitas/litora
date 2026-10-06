import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ScientificInputsRepository } from "./scientific-inputs.repository.js";

const url = process.env.TEST_DATABASE_URL;

test("PostgreSQL: повторный научный вход принадлежит владельцу и успешному job", { skip: !url }, async () => {
  assert.match(new URL(url!).pathname, /^\/litora_test_[a-z0-9_]+$/);
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(database, "pool", { value: pool });
  const repository = new ScientificInputsRepository(database);
  const users: string[] = [];
  try {
    await database.initialize();
    for (let index = 0; index < 2; index++) {
      const result = await database.query<{ id: string }>(
        "INSERT INTO users(email,password_hash,display_name) VALUES($1,'test-only','Тест артефактов') RETURNING id",
        [`${randomUUID()}@example.test`],
      );
      users.push(result.rows[0].id);
    }
    const succeededJob = randomUUID();
    const failedJob = randomUUID();
    await database.query(
      "INSERT INTO calculation_jobs(id,user_id,kind,status) VALUES($1,$2,'seabed_build','succeeded'),($3,$2,'seabed_build','failed')",
      [succeededJob, users[0], failedJob],
    );
    const ownArtifact = randomUUID();
    const failedArtifact = randomUUID();
    await database.query(
      `INSERT INTO calculation_artifacts(id,job_id,filename,bucket,object_key,size_bytes,sha256)
       VALUES($1,$2,'seabed/black-sea-depth.msh','private-test-bucket',$3,210000000,$4),
             ($5,$6,'seabed/black-sea-depth.msh','private-test-bucket',$7,210000000,$4)`,
      [ownArtifact, succeededJob, `users/${succeededJob}/seabed/black-sea-depth.msh`,
        "a".repeat(64), failedArtifact, failedJob,
        `users/${failedJob}/seabed/black-sea-depth.msh`],
    );
    const source = await repository.resolveOwnedSource(
      ownArtifact, users[0], "seabed_msh", "private-test-bucket",
    );
    assert.equal(source.origin, "artifact");
    assert.equal(source.sha256, "a".repeat(64));
    const available = await repository.listReusableArtifacts(users[0], "private-test-bucket");
    assert.deepEqual(available.map((item) => item.id), [ownArtifact]);
    assert.deepEqual(await repository.listReusableArtifacts(users[1], "private-test-bucket"), []);
    for (const [id, owner, role, bucket] of [
      [ownArtifact, users[1], "seabed_msh", "private-test-bucket"],
      [failedArtifact, users[0], "seabed_msh", "private-test-bucket"],
      [ownArtifact, users[0], "flat_mesh_msh", "private-test-bucket"],
      [ownArtifact, users[0], "seabed_msh", "other-bucket"],
    ] as const) {
      await assert.rejects(repository.resolveOwnedSource(id, owner, role, bucket));
    }
  } finally {
    if (users.length) {
      await database.query("DELETE FROM calculation_jobs WHERE user_id=ANY($1::uuid[])", [users]);
      await database.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    }
    await database.onModuleDestroy();
  }
});
