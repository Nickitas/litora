import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

assert.equal(
  process.env.TEST_S3_CORRUPTION,
  "1",
  "Тест подмены объекта запускается только при явном TEST_S3_CORRUPTION=1",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(process.env.S3_ENDPOINT).hostname),
  "Подмена разрешена только в локальном S3-совместимом стенде",
);
const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const invitation = JSON.parse(Buffer.concat(input).toString("utf8"))
  .invitations?.[0]?.code;
assert.ok(invitation, "Передайте JSON с одноразовым приглашением через stdin");
const base = process.env.TEST_API_URL;
assert.ok(base, "Явно укажите TEST_API_URL тестового API");
assert.equal(
  new URL(base).hostname,
  "localhost",
  "Тест должен обращаться к локальному тестовому API",
);

async function post(path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, `${path}: HTTP ${response.status}`);
  return response.json();
}

const auth = await post("/auth/register", {
  email: `corrupt-${randomUUID()}@example.test`,
  password: `test-${randomUUID()}`,
  name: "Проверка целостности S3",
  invitationCode: invitation,
});
const dataset = await post(
  "/datasets",
  {
    name: "Тестовый контур",
    source: "Изолированный интеграционный тест",
    license: "Тестовое использование",
    crs: "EPSG:4326",
    coordinateUnit: "degrees",
    geometry: {
      type: "LineString",
      coordinates: [
        [39.667927, 43.6442458],
        [39.6739089, 43.6407472],
        [39.6792709, 43.6389198],
      ],
    },
  },
  auth.accessToken,
);

const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const key = `users/${auth.user.id}/datasets/${dataset.id}.geojson`;
const saved = await storage.send(new GetObjectCommand({
  Bucket: process.env.S3_BUCKET, Key: key,
}));
assert.ok(saved.Body);
const original = Buffer.from(await saved.Body.transformToByteArray());
assert.equal(createHash("sha256").update(original).digest("hex"), dataset.sha256);
const tampered = Buffer.from(original);
const coordinate = Buffer.from("39.667927");
const offset = tampered.indexOf(coordinate);
assert.notEqual(offset, -1, "В сохранённом файле не найдена тестовая координата");
tampered[offset + coordinate.length - 1] = "8".charCodeAt(0);
assert.equal(tampered.length, original.length);
assert.notEqual(createHash("sha256").update(tampered).digest("hex"), dataset.sha256);
await storage.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: key,
  Body: tampered,
  ContentType: "application/geo+json",
}));
storage.destroy();

for (const suffix of ["", "/content"]) {
  const rejected = await fetch(`${base}/datasets/${dataset.id}${suffix}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  assert.equal(rejected.status, 503, "Повреждённый набор нельзя просмотреть или скачать");
  const failure = await rejected.json();
  assert.equal(failure.message, "Не удалось прочитать сохранённый набор. Повторите попытку позже.");
  assert.equal(JSON.stringify(failure).includes(key), false);
}

const job = await post(
  "/calculations",
  { kind: "dimension_dataset", input: { datasetId: dataset.id } },
  auth.accessToken,
);
let result;
for (let attempt = 0; attempt < 30; attempt++) {
  const response = await fetch(`${base}/calculations/${job.id}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  assert.equal(response.status, 200);
  result = await response.json();
  if (!["queued", "running"].includes(result.status)) break;
  await delay(1000);
}
assert.equal(result.status, "failed", `Неверный статус задания ${job.id}`);
assert.match(result.errorMessage, /Контрольная сумма или размер набора не совпадает/);
assert.equal(result.resultSummary, null);
assert.deepEqual(result.artifacts.map((artifact) => artifact.filename),
  ["failure.log"], "Подменённый вход не должен публиковать частичный результат");
console.log("Подменённый S3-объект отклонён до запуска научного расчёта");
