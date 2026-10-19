import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
let observedInputSchemaVersion;
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
let deletableMap;
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
  assert.ok(Number.isSafeInteger(result.inputSchemaVersion) && result.inputSchemaVersion > 0);
  observedInputSchemaVersion ??= result.inputSchemaVersion;
  assert.equal(result.inputSchemaVersion, observedInputSchemaVersion);
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
  const signedArtifactUrl = new URL(artifact.downloadUrl);
  assert.equal(signedArtifactUrl.searchParams.get("X-Amz-Expires"), "900");
  assert.ok(signedArtifactUrl.searchParams.has("X-Amz-Signature"));
  if (kind === "map") deletableMap = { id: job.id, manifestUrl: artifact.downloadUrl };
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
    const csv = result.artifacts.find((file) => file.filename === "csv/erosion-metrics.csv");
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
  let sourceJobId;
  let sourceManifestUrl;
  const dependentJobs = [];
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
    assert.equal(result.inputSchemaVersion, observedInputSchemaVersion);
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
      sourceJobId = job.id;
      sourceManifestUrl = manifestArtifact.downloadUrl;
      const reusable = await first.request("/scientific-inputs/reusable-artifacts");
      const snapshot = reusable.find((item) => item.jobId === job.id &&
        item.role === "coastline_geojson");
      assert.ok(snapshot, "Снимок Go должен быть доступен как вход следующего задания");
      inputId = snapshot.id;
      assert.deepEqual(await second.request("/scientific-inputs/reusable-artifacts"), []);
      await second.request("/calculations", "POST", {
        kind: "map_file", input: { coastlineInputId: snapshot.id },
      }, 404);
    } else {
      dependentJobs.push({ id: job.id, manifestUrl: manifestArtifact.downloadUrl });
      await second.request(`/calculations/${sourceJobId}`, "DELETE", undefined, 404);
      const conflict = await first.request(
        `/calculations/${sourceJobId}`, "DELETE", undefined, 409);
      assert.match(JSON.stringify(conflict), /используется другими расчётами/);
      assert.equal((await first.request(`/calculations/${sourceJobId}`)).status,
        "succeeded", "Источник должен сохраниться после отказа в удалении");
    }
    console.log(`${kind}: готово, ${result.artifacts.length} файлов`);
  }
  let deletionOverview;
  for (let attempt = 0; attempt < 30; attempt++) {
    deletionOverview = await first.request("/calculations/deletion-overview");
    if (deletionOverview.settlingCount === 0) break;
    await delay(1000);
  }
  assert.equal(deletionOverview.settlingCount, 0,
    "Worker должен освободить завершённые расчёты перед удалением");
  for (const [index, dependent] of dependentJobs.entries()) {
    const deletion = await first.request(`/calculations/${dependent.id}`, "DELETE", undefined, 202);
    assert.equal(deletion.scope, "single");
    let state;
    for (let attempt = 0; attempt < 60; attempt++) {
      state = await first.request(`/calculations/deletions/${deletion.id}`);
      if (state.status === "completed") break;
      await delay(1000);
    }
    assert.equal(state.status, "completed", JSON.stringify(state));
    assert.equal(state.deletedCount, 1);
    await first.request(`/calculations/${dependent.id}`, "GET", undefined, 404);
    assert.notEqual((await fetch(dependent.manifestUrl)).status, 200,
      "Удалённый потомок не должен оставлять доступный объект S3");
    if (index === 0) {
      const conflict = await first.request(
        `/calculations/${sourceJobId}`, "DELETE", undefined, 409);
      assert.match(JSON.stringify(conflict), /используется другими расчётами/);
    }
  }
  const sourceDeletion = await first.request(
    `/calculations/${sourceJobId}`, "DELETE", undefined, 202);
  let sourceDeletionState;
  for (let attempt = 0; attempt < 60; attempt++) {
    sourceDeletionState = await first.request(
      `/calculations/deletions/${sourceDeletion.id}`);
    if (sourceDeletionState.status === "completed") break;
    await delay(1000);
  }
  assert.equal(sourceDeletionState.status, "completed", JSON.stringify(sourceDeletionState));
  assert.equal(sourceDeletionState.deletedCount, 1);
  await first.request(`/calculations/${sourceJobId}`, "GET", undefined, 404);
  assert.equal((await first.request("/scientific-inputs/reusable-artifacts"))
    .some((item) => item.jobId === sourceJobId), false);
  assert.notEqual((await fetch(sourceManifestUrl)).status, 200,
    "Удалённый источник не должен оставлять доступный объект S3");
  console.log("Зависимые расчёты и источник удалены в правильном порядке");
}
if (process.env.TEST_MESH_ENABLED === "true") {
  const coastlineBytes = await readFile(new URL("../apps/lito-cli/data/examples/sochi-local-segment.geojson", import.meta.url));
  const coastline = await first.request("/scientific-inputs", "POST", {
    name: "Технический сегмент Сочи для Gmsh", role: "coastline_geojson",
    filename: "sochi-local-segment.geojson", sizeBytes: coastlineBytes.length,
    source: "OpenStreetMap, way 59530506, выгрузка 2026-08-17",
    license: "ODbL, технический пример Litora", crs: "EPSG:4326",
    coordinateUnit: "degrees",
  }, 201);
  await first.upload(`/scientific-inputs/${coastline.id}/content`, coastlineBytes);
  await second.request("/calculations", "POST", {
    kind: "mesh", input: { coastlineInputId: coastline.id,
      cellSizes: "2000", boundaryDetails: "2000", generators: "frontal-quad",
      maxCells: 1000, generatorTimeoutMinutes: 1 },
  }, 404);
  const job = await first.request("/calculations", "POST", {
    kind: "mesh", input: { coastlineInputId: coastline.id,
      cellSizes: "2000", boundaryDetails: "2000", generators: "frontal-quad",
      maxCells: 1000, generatorTimeoutMinutes: 1 },
  }, 201);
  let result;
  for (let attempt = 0; attempt < 150; attempt++) {
    result = await first.request(`/calculations/${job.id}`);
    if (!["queued", "running"].includes(result.status)) break;
    await delay(1000);
  }
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.methodId, null);
  const manifestFile = result.artifacts.find((file) => file.filename === "manifest.json");
  const meshFile = result.artifacts.find((file) => file.filename.endsWith(".msh"));
  const reportFile = result.artifacts.find((file) => file.filename === "mesh/mesh-comparison.json");
  assert.ok(manifestFile && meshFile && reportFile, "Heavy mesh должен сохранить MSH, отчёт и манифест");
  const signedUrl = new URL(meshFile.downloadUrl);
  assert.equal(signedUrl.searchParams.get("X-Amz-Expires"), "900");
  signedUrl.search = "";
  assert.equal((await fetch(signedUrl)).status, 403, "MSH должен оставаться приватным");
  const bytes = [];
  for (const file of [manifestFile, meshFile, reportFile]) {
    const response = await fetch(file.downloadUrl);
    assert.equal(response.status, 200);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash("sha256").update(data).digest("hex"), file.sha256);
    bytes.push(data);
  }
  const manifest = JSON.parse(bytes[0]);
  const report = JSON.parse(bytes[2]);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.command, "lito mesh");
  assert.ok(manifest.artifacts.some((file) => file.sha256 === meshFile.sha256));
  assert.ok(report.levels[0].results[0].metrics.cell_count > 0);
  assert.ok(process.env.TEST_MESH_CLI_BINARY,
    "Для сравнения CLI и worker передайте TEST_MESH_CLI_BINARY");
  const localOutput = await mkdtemp(join(tmpdir(), "litora-mesh-parity-"));
  try {
    await execFileAsync(process.env.TEST_MESH_CLI_BINARY, [
      "mesh", "--input", "data/examples/sochi-local-segment.geojson",
      "--cell-sizes", "2000", "--boundary-details", "2000",
      "--generators", "frontal-quad", "--max-cells", "1000",
      "--generator-timeout", "1m", "--output", localOutput,
    ], { cwd: fileURLToPath(new URL("../apps/lito-cli/", import.meta.url)), timeout: 120_000 });
    const localMesh = await readFile(join(localOutput, "mesh/msh", meshFile.filename.split("/").at(-1)));
    assert.equal(createHash("sha256").update(localMesh).digest("hex"), meshFile.sha256,
      "CLI и heavy worker должны создать одинаковую MSH на одном входе");
  } finally {
    await rm(localOutput, { recursive: true, force: true });
  }
  await second.request(`/calculations/${job.id}`, "GET", undefined, 404);
  console.log(`mesh: готово, ${result.artifacts.length} файлов, CLI и worker создали одинаковую MSH`);
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
assert.ok(deletableMap);
await second.request(`/calculations/${deletableMap.id}`, "DELETE", undefined, 404);
const deletion = await first.request(
  `/calculations/${deletableMap.id}`, "DELETE", undefined, 202,
);
assert.equal(deletion.scope, "single");
await second.request(`/calculations/deletions/${deletion.id}`, "GET", undefined, 404);
let deletionState;
for (let attempt = 0; attempt < 60; attempt++) {
  deletionState = await first.request(`/calculations/deletions/${deletion.id}`);
  if (deletionState.status === "completed") break;
  await delay(1000);
}
assert.equal(deletionState.status, "completed", JSON.stringify(deletionState));
assert.equal(deletionState.deletedCount, 1);
await first.request(`/calculations/${deletableMap.id}`, "GET", undefined, 404);
const deletedArtifact = await fetch(deletableMap.manifestUrl);
assert.notEqual(deletedArtifact.status, 200, "Удалённый артефакт не должен оставаться доступным");
console.log("Проверены удаление завершённого расчёта, изоляция владельца и очистка объекта S3");
await first.request("/auth/logout", "POST");
await first.request("/auth/me", "GET", undefined, 401);
await first.request("/auth/refresh", "POST", undefined, 401);
await second.request("/auth/logout", "POST");
console.log(
  "Проверены регистрация, вход, refresh, logout, изоляция пользователей, отмена, Swagger. Тестовые пользователи и отчёты сохранены в локальной БД.",
);
