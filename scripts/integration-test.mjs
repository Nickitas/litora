import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
    async upload(path, bytes, expected = 200) {
      const response = await fetch(`${base}${path}`, {
        method: "PUT",
        headers: {
          Origin: new URL(base).origin,
          "Content-Type": "application/octet-stream",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: bytes,
      });
      const payload = await response.json();
      assert.equal(response.status, expected,
        `PUT ${path}: HTTP ${response.status} ${JSON.stringify(payload)}`);
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
  sourceRevision: "test-snapshot-1",
  license: "Только для интеграционного теста", crs: "EPSG:4326",
  coordinateUnit: "degrees", geometry: inputGeometry,
}, 201);
assert.equal(uploaded.pointCount, inputGeometry.coordinates.length);
assert.equal(uploaded.schemaVersion, 1);
assert.equal(uploaded.sourceRevision, "test-snapshot-1");
assert.match(uploaded.sha256, /^[a-f0-9]{64}$/);
assert.equal((await first.request("/datasets"))[0].id, uploaded.id);
assert.deepEqual(await second.request("/datasets"), []);
const scientificBytes = await readFile(new URL("../apps/lito-cli/data/black-sea.json", import.meta.url));
const scientificRecord = await first.request("/scientific-inputs", "POST", {
  name: "Контур для проверки веб-сценариев",
  role: "coastline_geojson",
  filename: "black-sea.json",
  sizeBytes: scientificBytes.length,
  source: "Поставляемый контур Litora, копия для интеграционного теста",
  license: "Только для интеграционного теста",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
}, 201);
assert.equal(scientificRecord.status, "pending");
assert.deepEqual(await second.request("/scientific-inputs"), []);
assert.deepEqual(await second.request("/scientific-inputs/reusable-artifacts"), []);
await second.upload(`/scientific-inputs/${scientificRecord.id}/content`, scientificBytes, 404);
const readyScientific = await first.upload(
  `/scientific-inputs/${scientificRecord.id}/content`, scientificBytes,
);
assert.equal(readyScientific.status, "ready");
assert.equal(readyScientific.sha256,
  createHash("sha256").update(scientificBytes).digest("hex"));
assert.equal((await first.request("/scientific-inputs"))[0].id, scientificRecord.id);
await first.request("/datasets", "POST", {
  name: "Неверный CRS", source: "Тест", license: "Тест", crs: "EPSG:3857",
  coordinateUnit: "meters", geometry: inputGeometry,
}, 400);
await first.request("/datasets", "POST", {
  name: "Неверная долгота", source: "Тест", license: "Тест", crs: "EPSG:4326",
  coordinateUnit: "degrees", geometry: {
    type: "LineString", coordinates: [[181, 43.64], [39.68, 43.63]],
  },
}, 400);
await second.request("/calculations", "POST", {
  kind: "dimension_dataset", input: { datasetId: uploaded.id },
}, 404);
for (const kind of ["dimension", "dimension_dataset", "map", "erosion"]) {
  const expectedMethod = {
    dimension: "box-counting",
    dimension_dataset: "box-counting",
    map: "black-sea-overview",
    erosion: "cerc-one-line",
  }[kind];
  const job = await first.request(
    "/calculations",
    "POST",
    { kind, input: kind === "erosion" ? {
      steps: 2, cercCoefficient: 0.5, outputCsv: true, csvFormat: "wide",
    } :
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
  assert.equal(result.inputSchemaVersion, 3);
  assert.equal(result.resultSchemaVersion, 1);
  assert.equal(result.methodId, expectedMethod);
  assert.equal(result.methodRevision, "baseline-1");
  assert.deepEqual(result.resultSummary.method, {
    id: expectedMethod,
    revision: "baseline-1",
  });
  const inputFiles = result.resultSummary.provenance.files;
  assert.ok(Array.isArray(inputFiles) && inputFiles.length > 0);
  for (const file of inputFiles) {
    assert.match(file.path, /^(data\/[a-z0-9./-]+|input\.geojson)$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.sizeBytes > 0);
  }
  if (kind === "map")
    assert.ok(inputFiles.some((file) => file.path === "data/examples/sochi-local-segment.geojson"));
  if (kind === "erosion")
    assert.match(result.resultSummary.provenance.declaredSources.waves, /Open-Meteo/);
  if (kind === "erosion") {
    assert.match(result.commandLine, /--black-sea-sochi --offline/);
    assert.match(result.commandLine, /--cerc-coefficient 0\.5/);
    assert.match(result.commandLine, /--output-csv erosion-metrics\.csv --csv-format wide/);
  }
  if (kind === "dimension_dataset") {
    assert.equal(result.resultSummary.provenance.datasetId, uploaded.id);
    assert.equal(result.resultSummary.provenance.sourceRevision, "test-snapshot-1");
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
  const manifest = JSON.parse(data);
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.method, {
    id: expectedMethod,
    revision: "baseline-1",
  });
  assert.ok(manifest.artifacts.length > 0);
  if (kind === "erosion") {
    const csv = result.artifacts.find((file) => file.filename === "erosion-metrics.csv");
    assert.ok(csv, "CLI должен создать CSV для демонстрационного расчёта");
    const csvBytes = Buffer.from(await (await fetch(csv.downloadUrl)).arrayBuffer());
    assert.equal(createHash("sha256").update(csvBytes).digest("hex"), csv.sha256);
    assert.ok(manifest.artifacts.some((file) => file.path === "csv/erosion-metrics.csv"));
  }
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
if (process.env.TEST_HEAVY_ENABLED === "true") {
  await second.request("/calculations", "POST", {
    kind: "source_file", input: { coastlineInputId: scientificRecord.id },
  }, 404);
  let inputId = scientificRecord.id;
  for (const kind of ["source_file", "map_file", "dimension_file"]) {
    const job = await first.request("/calculations", "POST", {
      kind, input: { coastlineInputId: inputId },
    }, 201);
    let result;
    for (let attempt = 0; attempt < 150; attempt++) {
      result = await first.request(`/calculations/${job.id}`);
      if (!["queued", "running"].includes(result.status)) break;
      await delay(1000);
    }
    assert.equal(result.status, "succeeded", JSON.stringify(result));
    assert.equal(result.resultSummary.scenario, "user-data");
    assert.equal(result.inputSchemaVersion, 3);
    const manifestArtifact = result.artifacts.find((artifact) =>
      artifact.filename === "manifest.json");
    assert.ok(manifestArtifact);
    const manifestResponse = await fetch(manifestArtifact.downloadUrl);
    assert.equal(manifestResponse.status, 200);
    const manifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
    assert.equal(createHash("sha256").update(manifestBytes).digest("hex"),
      manifestArtifact.sha256);
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.command, kind === "source_file" ? "lito source" :
      kind === "map_file" ? "lito map" : "lito dimension");
    assert.equal(result.methodId, kind === "source_file" ? null :
      kind === "map_file" ? "black-sea-overview" : "box-counting");
    if (kind === "source_file") {
      const reusable = await first.request("/scientific-inputs/reusable-artifacts");
      const snapshot = reusable.find((item) => item.jobId === job.id &&
        item.role === "coastline_geojson");
      assert.ok(snapshot, "Снимок Go должен быть доступен как вход следующего задания");
      inputId = snapshot.id;
      assert.deepEqual(await second.request("/scientific-inputs/reusable-artifacts"), []);
      await second.request("/calculations", "POST", {
        kind: "map_file", input: { coastlineInputId: snapshot.id },
      }, 404);
    }
    console.log(`${kind}: готово, ${result.artifacts.length} файлов`);
  }
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
assert.equal(rejectedDataset.sourceRevision, null);
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
assert.deepEqual(failed.artifacts.map((artifact) => artifact.filename), ["failure.log"]);
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
assert.deepEqual(
  (await first.request(`/calculations/${cancelled.id}`)).artifacts,
  [],
  "Отменённый расчёт не должен публиковать частичные результаты",
);
assert.equal((await second.request("/calculations")).length, 0);
const swagger = await (await fetch(`${base}/docs-json`)).json();
assert.ok(swagger.paths["/api/calculations"].post);
assert.ok(swagger.paths["/api/datasets"].post);
assert.ok(swagger.paths["/api/scientific-inputs/reusable-artifacts"].get);
assert.ok(swagger.components.securitySchemes.bearer);
assert.ok(swagger.paths["/api/auth/register"].post.requestBody.content["application/json"].schema.required.includes("invitationCode"));
await first.request("/auth/logout", "POST");
await first.request("/auth/me", "GET", undefined, 401);
await first.request("/auth/refresh", "POST", undefined, 401);
await second.request("/auth/logout", "POST");
console.log(
  "Проверены регистрация, вход, refresh, logout, изоляция пользователей, отмена, Swagger. Тестовые пользователи и отчёты сохранены в локальной БД.",
);
