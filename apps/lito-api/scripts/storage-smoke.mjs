import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

// Файл окружения указывают явно: этот скрипт не должен выбирать .env.local сам.
if (process.env.LITORA_ENV_FILE) {
  const loaded = dotenv.config({ path: process.env.LITORA_ENV_FILE, quiet: true });
  if (loaded.error) throw loaded.error;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

const bucket = required("S3_BUCKET");
assert.equal(
  process.env.S3_SMOKE_CONFIRM_BUCKET,
  bucket,
  "Запуск разрешён только с S3_SMOKE_CONFIRM_BUCKET, равным staging bucket",
);
assert.equal(
  process.env.S3_SMOKE_STAGING,
  "true",
  "Для записи тестового объекта требуется S3_SMOKE_STAGING=true",
);
assert.equal(
  process.env.S3_REGION,
  "eu-central-1",
  "Проверка рассчитана на выбранный регион AWS eu-central-1",
);
assert.equal(
  process.env.S3_FORCE_PATH_STYLE,
  "false",
  "Для AWS S3 нужен S3_FORCE_PATH_STYLE=false",
);

const endpoint = new URL(required("S3_ENDPOINT"));
const publicEndpoint = new URL(required("S3_PUBLIC_ENDPOINT"));
const expectedHost = "s3.eu-central-1.amazonaws.com";
assert.equal(endpoint.protocol, "https:", "S3_ENDPOINT должен использовать HTTPS");
assert.equal(
  publicEndpoint.protocol,
  "https:",
  "S3_PUBLIC_ENDPOINT должен использовать HTTPS",
);
assert.equal(endpoint.host, expectedHost, "Неожиданный AWS S3 endpoint");
assert.equal(publicEndpoint.host, expectedHost, "Неожиданный публичный endpoint");
assert.equal(endpoint.pathname, "/", "Endpoint не должен содержать путь");
assert.equal(publicEndpoint.pathname, "/", "Endpoint не должен содержать путь");

const credentials = {
  accessKeyId: required("S3_ACCESS_KEY"),
  secretAccessKey: required("S3_SECRET_KEY"),
};
const client = new S3Client({
  endpoint: endpoint.origin,
  region: process.env.S3_REGION,
  forcePathStyle: false,
  credentials,
});
const signingClient = new S3Client({
  endpoint: publicEndpoint.origin,
  region: process.env.S3_REGION,
  forcePathStyle: false,
  credentials,
});

const key = `smoke-tests/${randomUUID()}.bin`;
const payload = randomBytes(48);
let uploaded = false;
let versionId;

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  const stored = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: payload,
      ContentType: "application/octet-stream",
    }),
  );
  uploaded = true;
  versionId = stored.VersionId;
  assert.ok(versionId, "На staging bucket должно быть включено versioning");

  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  assert.deepEqual(Buffer.from(await object.Body.transformToByteArray()), payload);

  const signed = await getSignedUrl(
    signingClient,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 },
  );
  const signedResponse = await fetch(signed);
  assert.equal(signedResponse.status, 200, "Подписанная ссылка не работает");
  assert.deepEqual(Buffer.from(await signedResponse.arrayBuffer()), payload);

  const unsigned = new URL(signed);
  unsigned.search = "";
  const unsignedResponse = await fetch(unsigned);
  assert.equal(unsignedResponse.status, 403, "Объект доступен без подписи");
  console.log("AWS S3 staging: HeadBucket, versioning, Put/Get, signed URL и приватность — OK");
} finally {
  try {
    if (uploaded && versionId) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
      );
      console.log("Тестовая версия объекта удалена из staging bucket");
    } else if (uploaded) {
      console.error(
        `Тестовый объект ${key} остался в staging bucket: S3 не вернул VersionId. Проверьте versioning и удалите объект вручную.`,
      );
    }
  } finally {
    client.destroy();
    signingClient.destroy();
  }
}
