import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
await storage.send(
  new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: `users/${auth.user.id}/datasets/${dataset.id}.geojson`,
    Body: Buffer.from(
      JSON.stringify({
        type: "LineString",
        coordinates: [[39.66, 43.64], [39.67, 43.63]],
      }),
    ),
    ContentType: "application/geo+json",
  }),
);
storage.destroy();

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
assert.equal(
  result.artifacts.some((artifact) => artifact.filename === "manifest.json"),
  false,
);
console.log("Подменённый S3-объект отклонён до запуска научного расчёта");
