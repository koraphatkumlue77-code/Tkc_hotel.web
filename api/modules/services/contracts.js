import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";
import { normalizeIdempotencyKey } from "../payments/contracts.js";

export function serviceSelection(body) {
  const value = requireObject(body);
  return {
    serviceId: integer(value.serviceId, "serviceId", 1, Number.MAX_SAFE_INTEGER),
    bookingRoomId: integer(value.bookingRoomId, "bookingRoomId", 1, Number.MAX_SAFE_INTEGER),
    quantity: integer(value.quantity ?? 1, "quantity", 1, 100),
    usageDate: nullableDate(value.usageDate)
  };
}

export function staffServiceSelection(body) {
  const value = requireObject(body);
  const selection = serviceSelection(value);
  const method = requireString("method", value.method, { max: 30 }).toUpperCase();
  if (!["CASH", "BANK_TRANSFER", "CARD"].includes(method)) invalid("method");
  return {
    ...selection,
    method,
    idempotencyKey: normalizeIdempotencyKey(value.idempotencyKey)
  };
}

function integer(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(field);
  return value;
}

function nullableDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("usageDate");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalid("usageDate");
  return value;
}

function invalid(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}
