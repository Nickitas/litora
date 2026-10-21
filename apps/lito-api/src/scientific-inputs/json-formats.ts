import { BadRequestException } from "@nestjs/common";
import { Ajv, type ValidateFunction } from "ajv";
import type { ScientificInputRole } from "@litora/contracts";
import { scientificInputFormat } from "./format-catalog.js";

const ajv = new Ajv({ strict: true, allowUnionTypes: true, allErrors: false, ownProperties: true,
  coerceTypes: false, removeAdditional: false, useDefaults: false, validateFormats: false });
const validators = new Map<ScientificInputRole, ValidateFunction>();

export function validateScientificJSON(role: ScientificInputRole, value: unknown): void {
  const format = scientificInputFormat(role);
  if (!format.schema) throw new BadRequestException("Для выбранной роли требуется другой формат файла");
  let validator = validators.get(role);
  if (!validator) { validator = ajv.compile(format.schema); validators.set(role, validator); }
  if (!validator(value)) {
    const error = validator.errors?.[0];
    const path = error?.instancePath || "/";
    const detail = error?.keyword === "additionalProperties" ? `неизвестное поле ${String(error.params.additionalProperty)}`
      : error?.keyword === "required" ? `нет обязательного поля ${String(error.params.missingProperty)}`
      : "значение не соответствует типу, версии или ограничениям схемы";
    throw new BadRequestException(`Формат ${role}, схема v${format.schemaVersion}, ${path}: ${detail}. Скачайте схему в форме загрузки.`);
  }
}
