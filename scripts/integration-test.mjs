import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const base = process.env.TEST_API_URL ?? "http://localhost:3000/api";
const invitations = JSON.parse(process.env.TEST_INVITATIONS_JSON ?? "{}").invitations;
assert.ok(Array.isArray(invitations) && invitations.length >= 3,
  "Передайте TEST_INVITATIONS_JSON с тремя одноразовыми приглашениями тестовой БД");
const codes = invitations.map((invitation) => invitation.code);
if (process.env.TEST_SEABED_BATHY_JSON) {
  assert.equal(process.env.TEST_MESH_ENABLED, "true",
    "Для seabed build включите TEST_MESH_ENABLED=true");
}
if (process.env.TEST_SEABED_CHAIN_ENABLED === "true") {
  assert.ok(process.env.TEST_SEABED_BATHY_JSON,
    "Для цепочки seabed укажите TEST_SEABED_BATHY_JSON");
}
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
const viewedDataset = await first.request(`/datasets/${uploaded.id}`);
assert.deepEqual({ ...viewedDataset, validation: undefined }, { ...uploaded, validation: undefined, geometry: inputGeometry });
for (const suffix of ["", "/content", "/validation"]) {
  await anonymous.request(`/datasets/${uploaded.id}${suffix}`, "GET", undefined, 401);
  await second.request(`/datasets/${uploaded.id}${suffix}`, "GET", undefined, 404);
  await first.request(`/datasets/${randomUUID()}${suffix}`, "GET", undefined, 404);
  await first.request(`/datasets/not-a-uuid${suffix}`, "GET", undefined, 400);
}
await anonymous.request(`/datasets/${uploaded.id}/validation`, "POST", undefined, 401);
await second.request(`/datasets/${uploaded.id}/validation`, "POST", undefined, 404);
async function awaitCoastlineValidation(path) {
  let state;
  for (let attempt = 0; attempt < 150; attempt++) {
    state = await first.request(`${path}/validation`);
    if (!["queued", "running"].includes(state.status)) break;
    await delay(200);
  }
  assert.ok(["succeeded", "failed"].includes(state.status), JSON.stringify(state));
  assert.equal(state.methodId, "coastline-validation");
  assert.equal(state.methodRevision, "geometry-1");
  return state;
}
assert.ok(uploaded.validation.jobId, "Сохранение автоматически ставит проверку в очередь");
const acceptedGeometry = await awaitCoastlineValidation(`/datasets/${uploaded.id}`);
assert.equal(acceptedGeometry.status, "succeeded");
assert.equal(acceptedGeometry.accepted, true);
const invalidGeometryDataset = await first.request("/datasets", "POST", {
  name: "Ошибочная область", source: "Отрицательный тест", license: "Тест",
  crs: "EPSG:4326", coordinateUnit: "degrees", geometry: { type: "LineString", coordinates: [[0,0], [1,1]] },
}, 201);
const rejectedGeometry = await awaitCoastlineValidation(`/datasets/${invalidGeometryDataset.id}`);
assert.equal(rejectedGeometry.status, "failed");
assert.equal(rejectedGeometry.accepted, false);
assert.ok(rejectedGeometry.issues.some((issue) => issue.code === "outside_black_sea"));
assert.equal((await first.request(`/datasets/${invalidGeometryDataset.id}`)).name, invalidGeometryDataset.name);
assert.equal((await first.request(`/calculations/${rejectedGeometry.jobId}`)).artifacts.some((artifact) => artifact.filename === "coastline-validation.json"), true);
console.log("Загрузка → Go worker: принятый и ошибочный контур, отчёт и паспорт сохранены");
const datasetFile = await fetch(`${base}/datasets/${uploaded.id}/content`, {
  headers: { Authorization: `Bearer ${first.token}` },
});
assert.equal(datasetFile.status, 200);
assert.equal(datasetFile.headers.get("cache-control"), "private, no-store");
assert.match(datasetFile.headers.get("content-type"), /^application\/geo\+json/);
const datasetBytes = Buffer.from(await datasetFile.arrayBuffer());
assert.deepEqual(datasetBytes, Buffer.from(JSON.stringify(inputGeometry)));
assert.equal(createHash("sha256").update(datasetBytes).digest("hex"), uploaded.sha256);
const scientificBytes = await readFile(new URL("../apps/lito-cli/data/coastline/black-sea.geojson", import.meta.url));
const emptyScientificQuota = {
  usedCount: 0, limitCount: 20, usedBytes: 0, limitBytes: 2 * 1024 ** 3,
};
assert.deepEqual(await first.request("/scientific-inputs/quota"), emptyScientificQuota);
assert.deepEqual(await second.request("/scientific-inputs/quota"), emptyScientificQuota);
const scientificRecord = await first.request("/scientific-inputs", "POST", {
  name: "Контур для проверки веб-сценариев",
  role: "coastline_geojson",
  filename: "black-sea.geojson",
  sizeBytes: scientificBytes.length,
  source: "MarineRegions MRGID 3319, закреплённый снимок Litora",
  license: "CC-BY; https://www.marineregions.org/disclaimer.php",
  crs: "EPSG:4326",
  coordinateUnit: "degrees",
}, 201);
assert.equal(scientificRecord.status, "pending");
assert.deepEqual(await first.request("/scientific-inputs/quota"), {
  ...emptyScientificQuota, usedCount: 1, usedBytes: scientificBytes.length,
});
assert.deepEqual(await second.request("/scientific-inputs/quota"), emptyScientificQuota);
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
if (process.env.TEST_COASTLINE_VALIDATION_ENABLED === "true") {
  const state = await awaitCoastlineValidation(`/scientific-inputs/${scientificRecord.id}`);
  assert.equal(typeof state.accepted, "boolean");
  await second.request(`/scientific-inputs/${scientificRecord.id}/validation`, "GET", undefined, 404);
  await second.request(`/scientific-inputs/${scientificRecord.id}/validation`, "POST", undefined, 404);
  console.log(`Научный контур → отдельная проверка Go: ${state.status}, замечаний ${state.issues.length}`);
}
assert.deepEqual(await first.request("/scientific-inputs/quota"), {
  ...emptyScientificQuota, usedCount: 1, usedBytes: scientificBytes.length,
});
const inputFormats = await first.request("/scientific-inputs/formats");
assert.equal(inputFormats.length, 19);
assert.equal(inputFormats.find((format) => format.role === "coastline_geojson").schema.$id,
  "urn:litora:input:coastline_geojson:v1");
const builtinPreview = await first.request("/calculations/coastline-preview");
assert.equal(builtinPreview.sha256, readyScientific.sha256);
const ownPreview = await first.request(`/scientific-inputs/${scientificRecord.id}/coastline-preview`);
assert.deepEqual(ownPreview.geojson, builtinPreview.geojson);
await second.request(`/scientific-inputs/${scientificRecord.id}/coastline-preview`, "GET", undefined, 404);
const malformedBytes = Buffer.from(JSON.stringify({ type: "LineString", coordinates: [[39, 43], [40, 44]], unexpected: true }));
const malformedInput = await first.request("/scientific-inputs", "POST", {
  name: "Неверный формат", role: "coastline_geojson", filename: "malformed.geojson",
  sizeBytes: malformedBytes.length, source: "Отрицательный тест", license: "Тест",
  crs: "EPSG:4326", coordinateUnit: "degrees",
}, 201);
await first.upload(`/scientific-inputs/${malformedInput.id}/content`, malformedBytes, 400);
assert.equal((await first.request("/scientific-inputs")).find((input) => input.id === malformedInput.id).status, "pending");
await first.request(`/scientific-inputs/${malformedInput.id}`, "DELETE");
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
for (const kind of ["dimension", "dimension_dataset", "map", "erosion", "all_demo"]) {
  const demo = kind === "erosion" || kind === "all_demo";
  const expectedMethod = {
    dimension: "box-counting",
    dimension_dataset: "box-counting",
    map: "black-sea-overview",
    erosion: "cerc-one-line",
    all_demo: null,
  }[kind];
  const expectedRevision = kind === "map" ? "scientific-map-3" : "reports-2";
  const job = await first.request(
    "/calculations",
    "POST",
    { kind, input: demo ? {
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
  assert.equal(result.methodRevision, expectedMethod ? expectedRevision : null);
  assert.deepEqual(result.resultSummary.method, expectedMethod ? {
    id: expectedMethod,
    revision: expectedRevision,
  } : null);
  const inputFiles = result.resultSummary.provenance.files;
  assert.ok(Array.isArray(inputFiles) && inputFiles.length > 0);
  for (const file of inputFiles) {
    assert.match(file.path, /^(data\/[a-z0-9./-]+|input\.geojson)$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.sizeBytes > 0);
  }
  if (kind === "map")
    assert.ok(inputFiles.some((file) => file.path === "data/examples/sochi-local-segment.geojson"));
  if (kind === "dimension" || kind === "map") {
    assert.ok(inputFiles.some((file) => file.path === "data/coastline/black-sea.geojson" &&
      file.sha256 === "116dcbc076ff0086e8bb3d72a34fc1df5353dc3c93c5cad91a99c336e039d246"));
    assert.match(result.commandLine, /--input data\/coastline\/black-sea.geojson/);
  }
  if (kind === "dimension") {
    const metrics = result.resultSummary.metrics["dimension.metrics.json"];
    assert.equal(metrics.reproducibility.input_point_count, 9635);
    assert.equal(metrics.reproducibility.input_geometry_sha256, "f6922e461df150852cc07e6532116cbf37a042ca504d1a40fc908825ee917fe9");
    assert.ok(Math.abs(metrics.iterations[0].dimension.dimension - 1.108395268193275) < 1e-10);
    const svg = result.artifacts.find((file) => file.filename === "svg/dimension_0.svg");
    assert.ok(svg && svg.sizeBytes > 100_000, "Ожидается полный SVG рисунка 1");
    const bytes = Buffer.from(await (await fetch(svg.downloadUrl)).arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), svg.sha256);
    assert.match(bytes.toString("utf8"), /D=1\.10840/);
    assert.ok(result.artifacts.some((file) => file.filename === "svg/dimension_loglog_0.svg"));
  }
  if (demo)
    assert.match(result.resultSummary.provenance.declaredSources.waves, /Open-Meteo/);
  if (demo) {
    assert.match(result.commandLine, /--black-sea-sochi --offline/);
    assert.match(result.commandLine, /--cerc-coefficient 0\.5/);
    assert.match(result.commandLine, kind === "all_demo"
      ? /--output-csv all-metrics\.csv --csv-format wide/
      : /--output-csv erosion-metrics\.csv --csv-format wide/);
  }
  if (kind === "dimension_dataset") {
    assert.equal(result.resultSummary.provenance.datasetId, uploaded.id);
    assert.equal(result.resultSummary.provenance.sourceRevision, "test-snapshot-1");
    assert.equal(result.resultSummary.provenance.sha256, uploaded.sha256);
    assert.equal(result.resultSummary.scenario, "user-data");
  }
  assert.ok(result.artifacts.length > 1);
  const execution = result.artifacts.find((file) => file.filename === "execution.log");
  assert.ok(execution);
  const logResponse = await fetch(execution.downloadUrl);
  assert.match(logResponse.headers.get("content-type") ?? "", /text\/plain;\s*charset=utf-8/i);
  const logBytes = Buffer.from(await logResponse.arrayBuffer());
  const logText = new TextDecoder("utf8", { fatal: true }).decode(logBytes);
  assert.ok(!logText.includes("\ufffd"), "Журнал Go не должен содержать повреждённую кириллицу");
  assert.equal(createHash("sha256").update(logBytes).digest("hex"), execution.sha256);
  if (kind === "map") {
    const map = result.artifacts.find((file) => file.filename === "svg/black-sea-coast.svg");
    assert.ok(map);
    const svg = await (await fetch(map.downloadUrl)).text();
    assert.match(svg, /id="coordinate-grid"/);
    assert.doesNotMatch(svg, /локальную съёмку|фрактальные итерации|Данные карты/);
  }
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
  assert.deepEqual(manifest.method, expectedMethod ? {
    id: expectedMethod,
    revision: expectedRevision,
  } : undefined);
  assert.ok(manifest.artifacts.length > 0);
  if (demo) {
    const csvName = kind === "all_demo" ? "csv/all-metrics.csv" : "csv/erosion-metrics.csv";
    const csv = result.artifacts.find((file) => file.filename === csvName);
    assert.ok(csv, "CLI должен создать CSV для демонстрационного расчёта");
    const csvBytes = Buffer.from(await (await fetch(csv.downloadUrl)).arrayBuffer());
    assert.equal(createHash("sha256").update(csvBytes).digest("hex"), csv.sha256);
    assert.ok(manifest.artifacts.some((file) => file.path === csvName));
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
{
  const observations = Buffer.from(JSON.stringify({ type: "FeatureCollection", features:
    ["2020-01-01T00:00:00Z", "2022-01-01T00:00:00Z"].map((date) => ({
      type: "Feature", properties: { date, satname: "test" },
      geometry: { type: "LineString", coordinates: [[39.6, 43.6], [39.8, 43.61]] },
    })),
  }));
  const input = await first.request("/scientific-inputs", "POST", {
    name: "Контролируемый ряд для проверки аудита", role: "shoreline_timeseries_geojson",
    filename: "observations.geojson", sizeBytes: observations.length,
    source: "Тестовая серия, не наблюдения", license: "Только для теста",
    crs: "EPSG:4326", coordinateUnit: "degrees",
  }, 201);
  await first.upload(`/scientific-inputs/${input.id}/content`, observations);
  const job = await first.request("/calculations", "POST", {
    kind: "shoreline_data_audit", input: { observationsInputId: input.id },
  }, 201);
  await second.request(`/calculations/${job.id}`, "GET", undefined, 404);
  let result;
  for (let attempt = 0; attempt < 150; attempt++) {
    result = await first.request(`/calculations/${job.id}`);
    if (!["queued", "running"].includes(result.status)) break;
    await delay(1000);
  }
  assert.equal(result.status, "succeeded");
  const report = result.resultSummary.metrics["shoreline-data-audit.json"];
  assert.equal(report.observationCount, 2);
  assert.deepEqual(report.years.map((year) => year.count), [1, 0, 1]);
  assert.equal(report.observationSha256, createHash("sha256").update(observations).digest("hex"));
  const artifact = result.artifacts.find((file) => file.filename === "shoreline-data-audit.json");
  assert.ok(artifact);
  const bytes = Buffer.from(await (await fetch(artifact.downloadUrl)).arrayBuffer());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
  console.log("shoreline_data_audit: готово, проверены даты, пробел ряда и SHA-256 отчёта");
}
let selectedCoastline;
for (const ownSource of [false, true]) {
  const bounds = { west: 29, east: 31.5, south: 44.5, north: 46.5 };
  const selection = await first.request("/calculations", "POST", {
    kind: "coastline_region", input: { ...bounds, ...(ownSource ? { coastlineInputId: scientificRecord.id } : {}) },
  }, 201);
  let result;
  for (let attempt = 0; attempt < 60; attempt++) {
    result = await first.request(`/calculations/${selection.id}`);
    if (!["queued", "running"].includes(result.status)) break;
    await delay(1000);
  }
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.methodId, "coastline-region");
  const reportFile = result.artifacts.find((file) => file.filename === "region/selection.json");
  const report = await (await fetch(reportFile.downloadUrl)).json();
  assert.equal(report.source_sha256, readyScientific.sha256);
  assert.deepEqual(report.bounds, { min_lon: bounds.west, max_lon: bounds.east, min_lat: bounds.south, max_lat: bounds.north });
  assert.ok(report.segments.length > 0);
  const reusable = await first.request("/scientific-inputs/reusable-artifacts");
  const longest = [...report.segments].sort((a, b) => b.point_count - a.point_count)[0];
  selectedCoastline = reusable.find((item) => item.jobId === selection.id && item.filename === longest.file);
  assert.equal(selectedCoastline.role, "coastline_geojson");
  const preview = await first.request(`/scientific-inputs/${selectedCoastline.id}/coastline-preview`);
  assert.equal(preview.geojson.type, "LineString");
  assert.equal(preview.geojson.coordinates.length, longest.point_count);
  for (const [lon, lat] of preview.geojson.coordinates) {
    assert.ok(lon >= bounds.west - 1e-10 && lon <= bounds.east + 1e-10);
    assert.ok(lat >= bounds.south - 1e-10 && lat <= bounds.north + 1e-10);
  }
  for (const file of result.artifacts) {
    const response = await fetch(file.downloadUrl);
    assert.equal(response.status, 200);
    assert.equal(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex"), file.sha256);
  }
  await second.request(`/scientific-inputs/${selectedCoastline.id}/coastline-preview`, "GET", undefined, 404);
  await second.request("/calculations", "POST", { kind: "coastline_region", input: { ...bounds, coastlineInputId: selectedCoastline.id } }, 404);
  console.log(`coastline_region (${ownSource ? "свой" : "встроенный"} источник): ${report.segments.length} отдельных линий, SHA-256 и доступ проверены`);
}
if (process.env.TEST_HEAVY_ENABLED === "true") {
  const next = await first.request("/calculations", "POST", {
    kind: "dimension_file", input: { coastlineInputId: selectedCoastline.id },
  }, 201);
  let state;
  for (let attempt = 0; attempt < 150; attempt++) {
    state = await first.request(`/calculations/${next.id}`);
    if (!["queued", "running"].includes(state.status)) break;
    await delay(1000);
  }
  assert.equal(state.status, "succeeded", JSON.stringify(state));
  assert.equal(state.resultSummary.provenance.files[0].sha256, selectedCoastline.sha256);
  console.log("coastline_region → dimension_file: расчёт по выделенной линии, SHA-256 источника совпал");
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
  if (process.env.TEST_MESH_CLI_BINARY) {
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
  } else {
    const expected = process.env.TEST_MESH_REFERENCE_SHA256;
    assert.match(expected ?? "", /^[a-f0-9]{64}$/,
      "Для сравнения с CLI в другом образе передайте TEST_MESH_REFERENCE_SHA256");
    assert.equal(meshFile.sha256, expected,
      "MSH heavy worker должна совпасть с отдельным CLI на том же Gmsh");
  }
  await second.request(`/calculations/${job.id}`, "GET", undefined, 404);
  console.log(`mesh: готово, ${result.artifacts.length} файлов, CLI и worker создали одинаковую MSH`);

  if (process.env.TEST_SEABED_BATHY_JSON) {
    assert.ok(process.env.TEST_SEABED_BATHY_METADATA,
      "Для seabed build укажите TEST_SEABED_BATHY_METADATA");
    const expectedDepthSha = process.env.TEST_SEABED_REFERENCE_SHA256;
    assert.match(expectedDepthSha ?? "", /^[a-f0-9]{64}$/,
      "Для seabed build укажите SHA-256 MSH отдельного CLI");
    const reusable = await first.request("/scientific-inputs/reusable-artifacts");
    const flatMesh = reusable.find((item) =>
      item.jobId === job.id && item.role === "flat_mesh_msh");
    assert.ok(flatMesh, "Плоская MSH должна быть доступна следующему заданию");
    const uploadInput = async (path, role, name) => {
      const bytes = await readFile(path);
      const record = await first.request("/scientific-inputs", "POST", {
        name, role, filename: basename(path), sizeBytes: bytes.length,
        source: "GEBCO_2026, региональный срез официального OPeNDAP",
        license: "Public domain по условиям GEBCO с обязательной атрибуцией",
        crs: "EPSG:4326", coordinateUnit: "degrees",
      }, 201);
      await first.upload(`/scientific-inputs/${record.id}/content`, bytes);
      return record.id;
    };
    const bathymetryInputId = await uploadInput(process.env.TEST_SEABED_BATHY_JSON,
      "bathymetry_grid_json", "Производный набор GEBCO для теста");
    const bathymetryMetadataInputId = await uploadInput(process.env.TEST_SEABED_BATHY_METADATA,
      "bathymetry_grid_metadata_json", "Паспорт набора GEBCO для теста");
    await second.request("/calculations", "POST", { kind: "seabed_build", input: {
      flatMeshInputId: flatMesh.id, bathymetryInputId, bathymetryMetadataInputId,
      coastlineInputId: coastline.id, boundaryDetail: 2000,
    } }, 404);
    const build = await first.request("/calculations", "POST", { kind: "seabed_build", input: {
      flatMeshInputId: flatMesh.id, bathymetryInputId, bathymetryMetadataInputId,
      coastlineInputId: coastline.id, boundaryDetail: 2000,
    } }, 201);
    let built;
    for (let attempt = 0; attempt < 150; attempt++) {
      built = await first.request(`/calculations/${build.id}`);
      if (!["queued", "running"].includes(built.status)) break;
      await delay(1000);
    }
    assert.equal(built.status, "succeeded", JSON.stringify(built));
    const depth = built.artifacts.find((file) => file.filename === "seabed/black-sea-depth.msh");
    const buildReport = built.artifacts.find((file) => file.filename === "seabed/build-report.json");
    const buildManifest = built.artifacts.find((file) => file.filename === "manifest.json");
    assert.ok(depth && buildReport && buildManifest,
      "seabed build должен сохранить MSH, отчёт и манифест");
    assert.equal(depth.sha256, expectedDepthSha,
      "MSH seabed build должна совпасть с отдельным CLI на том же Gmsh");
    for (const file of [depth, buildReport, buildManifest]) {
      const response = await fetch(file.downloadUrl);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    }
    const unsignedDepthUrl = new URL(depth.downloadUrl);
    unsignedDepthUrl.search = "";
    assert.equal((await fetch(unsignedDepthUrl)).status, 403);
    await second.request(`/calculations/${build.id}`, "GET", undefined, 404);
    console.log(`seabed_build: готово, ${built.artifacts.length} файлов, MSH совпала с CLI`);

    if (process.env.TEST_SEABED_CHAIN_ENABLED === "true") {
      const inputs = await first.request("/scientific-inputs/reusable-artifacts");
      const ownedArtifact = (jobId, role) => {
        const artifact = inputs.find((item) => item.jobId === jobId && item.role === role);
        assert.ok(artifact, `Не найден повторно используемый артефакт ${role}`);
        return artifact.id;
      };
      const modelInputId = ownedArtifact(build.id, "seabed_msh");
      const exportMetadataInputId = ownedArtifact(build.id, "export_metadata_json");
      const sourceMetadataInputId = ownedArtifact(build.id, "bathymetry_source_json");
      const runSeabed = async (kind, input, expectedFilename) => {
        const next = await first.request("/calculations", "POST", { kind, input }, 201);
        let state;
        for (let attempt = 0; attempt < 150; attempt++) {
          state = await first.request(`/calculations/${next.id}`);
          if (!["queued", "running"].includes(state.status)) break;
          await delay(1000);
        }
        assert.equal(state.status, "succeeded", JSON.stringify(state));
        const artifact = state.artifacts.find((file) => file.filename === expectedFilename);
        assert.ok(artifact, `${kind} должен сохранить ${expectedFilename}`);
        const response = await fetch(artifact.downloadUrl);
        assert.equal(response.status, 200);
        assert.equal(createHash("sha256").update(Buffer.from(await response.arrayBuffer()))
          .digest("hex"), artifact.sha256);
        const expectedFigures = kind === "seabed_render"
          ? [["seabed/svg/bathymetry-overview.svg", "map-title"], ["seabed/svg/mesh-details.svg", 'data-unthinned="true"']]
          : kind === "seabed_adapt" ? [["seabed/svg/size-field.svg", 'data-adaptive-mesh-generated="false"']] : [];
        for (const [filename, marker] of expectedFigures) {
          const figure = state.artifacts.find((file) => file.filename === filename);
          assert.ok(figure, `Нет научного рисунка ${filename}`);
          const imageResponse = await fetch(figure.downloadUrl);
          assert.equal(imageResponse.status, 200);
          const svg = await imageResponse.text();
          assert.ok(svg.includes(marker), `SVG ${filename} не содержит ${marker}`);
          assert.equal(createHash("sha256").update(svg).digest("hex"), figure.sha256);
        }
        await second.request(`/calculations/${next.id}`, "GET", undefined, 404);
        console.log(`${kind}: готово, ${state.artifacts.length} файлов`);
        return next.id;
      };
      await runSeabed("seabed_render", {
        modelInputId, exportMetadataInputId, sourceMetadataInputId,
      }, "seabed/svg/bathymetry-overview.svg");
      const adaptId = await runSeabed("seabed_adapt", {
        modelInputId, sourceMetadataInputId,
      }, "seabed/adaptive/size-field.csv");
      const adaptedInputs = await first.request("/scientific-inputs/reusable-artifacts");
      const fieldCsvInputId = adaptedInputs.find((item) =>
        item.jobId === adaptId && item.role === "adaptive_field_csv")?.id;
      const fieldReportInputId = adaptedInputs.find((item) =>
        item.jobId === adaptId && item.role === "adaptive_field_report_json")?.id;
      assert.ok(fieldCsvInputId && fieldReportInputId,
        "Поле ADAPT-01 должно быть доступно следующим заданиям");
      const adaptiveInput = {
        modelInputId, exportMetadataInputId, fieldCsvInputId,
        fieldReportInputId, coastlineInputId: coastline.id, boundaryDetail: 2000,
        maxCells: 20000, generatorTimeoutMinutes: 1,
      };
      await runSeabed("seabed_generate_adaptive", {
        ...adaptiveInput, generator: "frontal-quad",
      }, "seabed/adaptive/gmsh/black-sea-adaptive.msh");
      await runSeabed("seabed_compare_adaptive", {
        ...adaptiveInput, generators: "delaunay,frontal-quad,parallelograms",
        levels: "local:200:1000", detailPreset: "none",
      }, "seabed/adaptive/comparison/adaptive-generator-comparison.json");
    }
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
assert.ok(swagger.paths["/api/scientific-inputs/quota"].get);
assert.ok(swagger.paths["/api/calculations/coastline-preview"].get);
assert.ok(swagger.paths["/api/scientific-inputs/{id}/coastline-preview"].get);
assert.ok(swagger.paths["/api/scientific-inputs/formats"].get);
assert.ok(swagger.components.schemas.CalculationResponse.properties.kind.enum.includes("coastline_region"));
assert.equal(swagger.components.schemas.ScientificInputFormatResponse.properties.schema.nullable, true);
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
