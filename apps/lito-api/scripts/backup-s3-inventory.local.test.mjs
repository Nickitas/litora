import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createManifest } from "../../../scripts/backup-manifest.mjs";
import { captureInventory, verifyCopiedInventory } from "./backup-s3-inventory.mjs";

test("перечень и копия проходят smoke на отдельном локальном S3", {
  skip: process.env.BACKUP_S3_LOCAL !== "true",
}, async () => {
  const endpoint = new URL(process.env.BACKUP_S3_ENDPOINT ?? "");
  if (endpoint.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))
    throw new Error("Интеграционный smoke разрешён только на localhost");
  const suffix = randomUUID().slice(0, 12);
  const source = `litora-backup-src-${suffix}`;
  const destination = `litora-backup-dst-${suffix}`;
  const prefix = `snapshots/${suffix}/objects/`;
  const objects = ["users/a.txt", "users/b.txt", "users/c.txt"];
  const client = new S3Client({
    endpoint: endpoint.origin,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const directory = await mkdtemp(join(tmpdir(), "litora-backup-s3-smoke-"));
  const buckets = [];
  try {
    for (const bucket of [source, destination]) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      buckets.push(bucket);
    }
    await writeFile(join(directory, "litora.dump"), "test dump\n");
    await writeFile(join(directory, "artifacts.csv"), "bucket,object_key,size_bytes,sha256\n");
    for (const [index, key] of objects.entries()) {
      const body = Buffer.from(`artifact-${index}`);
      await client.send(new PutObjectCommand({ Bucket: source, Key: key, Body: body }));
      await client.send(new PutObjectCommand({ Bucket: destination, Key: `${prefix}${key}`, Body: body }));
    }
    assert.equal((await captureInventory(directory, source, client)).count, objects.length);
    await createManifest(directory, `s3://${destination}/${prefix}`);
    assert.equal((await verifyCopiedInventory(directory, client)).count, objects.length);
  } finally {
    for (const key of objects) {
      if (buckets.includes(source))
        await client.send(new DeleteObjectCommand({ Bucket: source, Key: key }));
      if (buckets.includes(destination))
        await client.send(new DeleteObjectCommand({ Bucket: destination, Key: `${prefix}${key}` }));
    }
    for (const bucket of buckets.reverse())
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
