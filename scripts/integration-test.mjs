import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.TEST_API_URL ?? "http://localhost:3000/api";
const invitations = JSON.parse(process.env.TEST_INVITATIONS_JSON ?? "{}").invitations;
assert.ok(Array.isArray(invitations) && invitations.length >= 3,
  "Передайте TEST_INVITATIONS_JSON с тремя одноразовыми приглашениями тестовой БД");
const codes = invitations.map((invitation) => invitation.code);
function client() {
  let cookie = "",
    access = "";
  return {
    get token() {
      return access;
    },
    async request(path, method = "GET", body, expected = 200) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Origin: new URL(base).origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      assert.equal(
        response.status,
        expected,
        path.startsWith("/auth/")
          ? `${method} ${path}: HTTP ${response.status}`
          : `${method} ${path}: ${JSON.stringify(payload)}`,
      );
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      if (payload.accessToken) access = payload.accessToken;
      return payload;
    },
  };
}
const first = client(),
  second = client(),
  anonymous = client();
const email = `integration-${randomUUID()}@example.test`;
const password = `test-${randomUUID()}`;
const blockedOrigin = await fetch(`${base}/auth/refresh`, {
  method: "POST",
  headers: { Origin: "https://untrusted.example" },
});
assert.equal(blockedOrigin.status, 403);
await anonymous.request("/calculations", "GET", undefined, 401);
await anonymous.request("/auth/register", "POST", { email, password, name: "Без ключа" }, 400);
await anonymous.request("/auth/register", "POST", {
  email, password, name: "Неизвестный ключ", invitationCode: `litora_${"x".repeat(43)}`,
}, 403);
await first.request(
  "/auth/register",
  "POST",
  { email, password, name: "Проверка интеграции", invitationCode: codes[0] },
  201,
);
await first.request("/auth/login", "POST", { email, password });
await anonymous.request("/auth/register", "POST", {
  email: `reuse-${randomUUID()}@example.test`, password, name: "Повтор", invitationCode: codes[0],
}, 403);
await anonymous.request("/auth/register", "POST", {
  email, password, name: "Дубликат почты", invitationCode: codes[1],
}, 409);
await second.request(
  "/auth/register",
  "POST",
  {
    email: `other-${randomUUID()}@example.test`,
    password,
    name: "Проверка изоляции",
    invitationCode: codes[1],
  },
  201,
);
const race = await Promise.all([0, 1].map(async () => {
  const response = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(base).origin },
    body: JSON.stringify({ email: `race-${randomUUID()}@example.test`, password,
      name: "Одновременная регистрация", invitationCode: codes[2] }),
  });
  // Не выводим body: успешный ответ содержит access token.
  await response.arrayBuffer();
  return response.status;
}));
assert.deepEqual(race.sort(), [201, 403]);
const previousToken = first.token;
await first.request("/auth/refresh", "POST");
assert.notEqual(first.token, previousToken);
const old = await fetch(`${base}/auth/me`, {
  headers: { Authorization: `Bearer ${previousToken}` },
});
assert.equal(old.status, 401);
await first.request(
  "/calculations",
  "POST",
  { kind: "dimension", input: { input: "/etc/passwd" } },
  400,
);
const inputGeometry = { type: "LineString", coordinates: [
  [39.667927, 43.6442458], [39.6739089, 43.6407472],
  [39.6792709, 43.6389198], [39.6853954, 43.6341751],
] };
const uploaded = await first.request("/datasets", "POST", {
  name: "Тестовый участок Сочи", source: "Тестовая линия интеграции",
  license: "Только для интеграционного теста", crs: "EPSG:4326",
  coordinateUnit: "degrees", geometry: inputGeometry,
}, 201);
assert.equal(uploaded.pointCount, inputGeometry.coordinates.length);
assert.match(uploaded.sha256, /^[a-f0-9]{64}$/);
assert.equal((await first.request("/datasets"))[0].id, uploaded.id);
assert.deepEqual(await second.request("/datasets"), []);
await first.request("/datasets", "POST", {
  name: "Неверный CRS", source: "Тест", license: "Тест", crs: "EPSG:3857",
  coordinateUnit: "meters", geometry: inputGeometry,
}, 400);
await second.request("/calculations", "POST", {
  kind: "dimension_dataset", input: { datasetId: uploaded.id },
}, 404);
for (const kind of ["dimension", "dimension_dataset", "map", "erosion"]) {
  const job = await first.request(
    "/calculations",
    "POST",
    { kind, input: kind === "erosion" ? { steps: 2 } :
      kind === "dimension_dataset" ? { datasetId: uploaded.id } : {} },
    201,
  );
  await second.request(`/calculations/${job.id}`, "GET", undefined, 404);
  await second.request(
    `/calculations/${job.id}/cancel`,
    "POST",
    undefined,
    404,
  );
  let result;
  for (let attempt = 0; attempt < 150; attempt++) {
    result = await first.request(`/calculations/${job.id}`);
    if (!["queued", "running"].includes(result.status)) break;
    await delay(1000);
  }
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  if (kind === "dimension_dataset") {
    assert.equal(result.resultSummary.provenance.datasetId, uploaded.id);
    assert.equal(result.resultSummary.provenance.sha256, uploaded.sha256);
    assert.equal(result.resultSummary.scenario, "user-data");
  }
  assert.ok(result.artifacts.length > 1);
  const artifact = result.artifacts.find((file) =>
    file.filename.endsWith("manifest.json"),
  );
  assert.ok(artifact, "CLI должен создать манифест");
  const download = await fetch(artifact.downloadUrl);
  assert.equal(download.status, 200);
  const data = Buffer.from(await download.arrayBuffer());
  assert.equal(
    createHash("sha256").update(data).digest("hex"),
    artifact.sha256,
  );
  assert.ok(JSON.parse(data).artifacts.length > 0);
  const unsigned = new URL(artifact.downloadUrl);
  unsigned.search = "";
  assert.equal(
    (await fetch(unsigned)).status,
    403,
    "Bucket должен быть приватным",
  );
  console.log(
    `${kind}: готово, ${result.artifacts.length} файлов, проверены манифест, SHA-256 и приватность S3`,
  );
}
const rejectedDataset = await first.request("/datasets", "POST", {
  name: "Контур вне Чёрного моря",
  source: "Негативный интеграционный тест",
  license: "Тестовое использование",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
  geometry: {
    type: "LineString",
    coordinates: [[0, 0], [1, 1], [2, 2]],
  },
}, 201);
const rejectedJob = await first.request("/calculations", "POST", {
  kind: "dimension_dataset",
  input: { datasetId: rejectedDataset.id },
}, 201);
let failed;
for (let attempt = 0; attempt < 30; attempt++) {
  failed = await first.request(`/calculations/${rejectedJob.id}`);
  if (!["queued", "running"].includes(failed.status)) break;
  await delay(1000);
}
assert.equal(failed.status, "failed", JSON.stringify(failed));
assert.match(failed.errorMessage, /вне области Чёрного моря/);
assert.ok(
  failed.artifacts.some((artifact) => artifact.filename === "failure.log"),
  "Отказ Go должен оставить диагностический журнал",
);
assert.equal(
  failed.artifacts.some((artifact) => artifact.filename === "manifest.json"),
  false,
  "Неуспешный расчёт не должен иметь manifest успешного результата",
);
console.log("Невалидная для Go геометрия завершилась failed с журналом");
const cancelled = await first.request(
  "/calculations",
  "POST",
  { kind: "erosion", input: { steps: 48 } },
  201,
);
await first.request(
  `/calculations/${cancelled.id}/cancel`,
  "POST",
  undefined,
  201,
);
await delay(3000);
assert.equal(
  (await first.request(`/calculations/${cancelled.id}`)).status,
  "cancelled",
);
assert.equal((await second.request("/calculations")).length, 0);
const swagger = await (await fetch(`${base}/docs-json`)).json();
assert.ok(swagger.paths["/api/calculations"].post);
assert.ok(swagger.paths["/api/datasets"].post);
assert.ok(swagger.components.securitySchemes.bearer);
assert.ok(swagger.paths["/api/auth/register"].post.requestBody.content["application/json"].schema.required.includes("invitationCode"));
await first.request("/auth/logout", "POST");
await first.request("/auth/me", "GET", undefined, 401);
await first.request("/auth/refresh", "POST", undefined, 401);
await second.request("/auth/logout", "POST");
console.log(
  "Проверены регистрация, вход, refresh, logout, изоляция пользователей, отмена, Swagger. Тестовые пользователи и отчёты сохранены в локальной БД.",
);
