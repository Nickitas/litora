import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCredentials } from "./auth.service.js";

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
      { email: "Test@Example.com", password: "long-password", name: " Имя " },
      true,
    ).email,
    "test@example.com",
  );
});
