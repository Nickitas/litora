import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCredentials } from "./auth.service.js";
import { createInvitationCode, invitationDigest } from "./invitations.js";

test("валидация регистрации ограничивает поля и размер пароля", () => {
  assert.throws(() =>
    validateCredentials({ email: "a@b.c", password: "short", name: "А" }, true),
  );
  assert.throws(() =>
    validateCredentials(
      { email: "a@b.c", password: "long-password", name: "А", role: "admin" },
      true,
    ),
  );
  assert.throws(() =>
    validateCredentials({ email: "invalid", password: "long-password" }),
  );
  assert.equal(
    validateCredentials(
      { email: "Test@Example.com", password: "long-password", name: " Имя ", invitationCode: createInvitationCode() },
      true,
    ).email,
    "test@example.com",
  );
});

test("регистрация требует ключ; вход не принимает ключ как лишнее поле", () => {
  const body = { email: "a@b.c", password: "long-password", name: "Имя" };
  for (const invitationCode of [undefined, null, "", "shared-key", 42])
    assert.throws(() => validateCredentials({ ...body, invitationCode }, true));
  const code = createInvitationCode();
  assert.equal(validateCredentials({ ...body, invitationCode: ` ${code} ` }, true).invitationCode, code);
  assert.throws(() => validateCredentials({ email: body.email, password: body.password, invitationCode: code }));
  assert.notEqual(createInvitationCode(), code);
  assert.match(invitationDigest(code), /^[0-9a-f]{64}$/);
  assert.notEqual(invitationDigest(code), code);
});
