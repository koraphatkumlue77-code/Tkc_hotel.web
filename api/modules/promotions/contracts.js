import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export function promotionInput(body) {
  const value = requireObject(body);
  const code = requireString("code", value.code, { max: 50 }).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) invalid("code");
  const discountPercent = decimal(value.discountPercent, "discountPercent", 0, 100);
  if (Number(discountPercent) <= 0) invalid("discountPercent");
  const priority = integer(value.priority, "priority", 0, 100000);
  const validFrom = timestamp(value.validFrom, "validFrom");
  const validUntil = timestamp(value.validUntil, "validUntil");
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) invalid("validUntil");
  return {
    code,
    name: requireString("name", value.name, { max: 150 }),
    discountPercent,
    priority,
    validFrom,
    validUntil,
    active: boolean(value.active, "active")
  };
}

export function attractionInput(body) {
  const value = requireObject(body);
  const schedule = value.schedule ?? null;
  if (schedule !== null || value.schedule !== undefined) {
    if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) invalid("schedule");
    if (JSON.stringify(schedule).length > 2000) invalid("schedule");
  }
  return {
    name: requireString("name", value.name, { max: 100 }),
    description: optionalString(value.description, "description", 2000),
    season: optionalString(value.season, "season", 30),
    imageReference: optionalString(value.imageReference, "imageReference", 500),
    schedule,
    visible: boolean(value.visible, "visible"),
    active: boolean(value.active, "active")
  };
}

function decimal(value, field, minimum, maximum) {
  if (typeof value !== "string" || !/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) invalid(field);
  const number = Number(value);
  if (number < minimum || number > maximum) invalid(field);
  return number.toFixed(2);
}

function integer(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(field);
  return value;
}

function timestamp(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) invalid(field);
  return new Date(value).toISOString();
}

function optionalString(value, field, max) {
  if (value === null || value === undefined || value === "") return null;
  return requireString(field, value, { max });
}

function boolean(value, field) {
  if (typeof value !== "boolean") invalid(field);
  return value;
}

function invalid(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", { fields: { [field]: "Invalid value" } });
}
