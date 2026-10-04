import { BadRequestException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

/** Создаёт случайный одноразовый ключ; исходное значение отдаётся только оператору. */
export function createInvitationCode(): string {
  return `litora_${randomBytes(32).toString("base64url")}`;
}

/** Проверяет формат ключа, не раскрывая его в сообщении об ошибке. */
export function validateInvitationCode(value: unknown): string {
  if (typeof value !== "string" || !/^litora_[A-Za-z0-9_-]{43}$/.test(value.trim()))
    throw new BadRequestException("Укажите корректный ключ приглашения");
  return value.trim();
}

/** Возвращает необратимый идентификатор ключа для хранения в БД. */
export function invitationDigest(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
