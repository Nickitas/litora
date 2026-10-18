import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env.local", import.meta.url)),
  quiet: true,
});

if (process.env.S3_SMOKE_LOCAL !== "true") {
  throw new Error("Для локального S3 smoke-теста задайте S3_SMOKE_LOCAL=true");
}

const endpoint = new URL(process.env.S3_ENDPOINT ?? "");
if (
  endpoint.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) ||
  endpoint.pathname !== "/"
) {
  throw new Error("Smoke-тест разрешён только для HTTP S3 на localhost");
}

const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;
if (!accessKeyId || !secretAccessKey) {
  throw new Error("Задайте S3_ACCESS_KEY и S3_SECRET_KEY тестового хранилища");
}

const client = new S3Client({
  endpoint: endpoint.origin,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});
const bucket = `litora-smoke-${randomUUID()}`;
const key = "check.txt";
const bytes = Buffer.from("Проверка локального S3 Litora\n", "utf8");
let bucketCreated = false;
let objectCreated = false;

try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  bucketCreated = true;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes }));
  objectCreated = true;

  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  assert.deepEqual(Buffer.from(await object.Body.transformToByteArray()), bytes);

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 },
  );
  const response = await fetch(signedUrl);
  assert.equal(response.status, 200, "Подписанная ссылка не открылась");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  console.log("Локальный S3: bucket, upload, download и signed URL работают");
} finally {
  try {
    if (objectCreated) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    if (bucketCreated) await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  } finally {
    client.destroy();
  }
}
