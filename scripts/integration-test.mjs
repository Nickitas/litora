import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.TEST_API_URL ?? "http://localhost:3000/api";
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
        `${method} ${path}: ${JSON.stringify(payload)}`,
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
await first.request(
  "/auth/register",
  "POST",
  { email, password, name: "Проверка интеграции" },
  201,
);
await first.request("/auth/login", "POST", { email, password });
await second.request(
  "/auth/register",
  "POST",
  {
    email: `other-${randomUUID()}@example.test`,
    password,
    name: "Проверка изоляции",
  },
  201,
);
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
for (const kind of ["dimension", "map", "erosion"]) {
  const job = await first.request(
    "/calculations",
    "POST",
    { kind, input: kind === "erosion" ? { steps: 2 } : {} },
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
assert.ok(swagger.components.securitySchemes.bearer);
await first.request("/auth/logout", "POST");
await first.request("/auth/me", "GET", undefined, 401);
await first.request("/auth/refresh", "POST", undefined, 401);
await second.request("/auth/logout", "POST");
console.log(
  "Проверены регистрация, вход, refresh, logout, изоляция пользователей, отмена, Swagger. Тестовые пользователи и отчёты сохранены в локальной БД.",
);
