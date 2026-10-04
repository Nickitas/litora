import assert from "node:assert/strict";
import { test } from "node:test";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { environment } from "../config/environment.js";
import { ObjectStorageService } from "./object-storage.service.js";

test("отсутствующий bucket создаётся только при разрешённом auto-create", async () => {
  const original = environment.s3.autoCreateBucket;
  const commands: unknown[] = [];
  const service = Object.assign(Object.create(ObjectStorageService.prototype), {
    bucket: "litora-test",
    client: {
      send: async (command: unknown) => {
        commands.push(command);
        if (command instanceof HeadBucketCommand)
          throw { $metadata: { httpStatusCode: 404 } };
      },
    },
  }) as ObjectStorageService;

  try {
    environment.s3.autoCreateBucket = false;
    await assert.rejects(service.initialize(), /Создайте приватный bucket/);
    assert.equal(commands.length, 1);
    assert.ok(commands[0] instanceof HeadBucketCommand);

    commands.length = 0;
    environment.s3.autoCreateBucket = true;
    await service.initialize();
    assert.equal(commands.length, 2);
    assert.ok(commands[1] instanceof CreateBucketCommand);
  } finally {
    environment.s3.autoCreateBucket = original;
  }
});
