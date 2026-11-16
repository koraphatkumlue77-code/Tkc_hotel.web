import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";
import { normalizeIdempotencyKey } from "../payments/contracts.js";

export function serviceSelection(body) {
  const value = requireObject(body);
  return selection(value, true);
}

function selection(value, requireStartTime) {
  const startTime = value.startTime == null || value.startTime === ""
    ? null
    : time(value.startTime, "startTime");
  if (requireStartTime && !startTime) invalid("startTime");
  return {
    serviceId: integer(value.serviceId, "serviceId", 1, Number.MAX_SAFE_INTEGER),
    bookingRoomId: integer(value.bookingRoomId, "bookingRoomId", 1, Number.MAX_SAFE_INTEGER),
    quantity: integer(value.quantity ?? 1, "quantity", 1, 100),
    usageDate: nullableDate(value.usageDate),
    startTime
  };
}

export function staffServiceSelection(body) {
  const value = requireObject(body);
  const normalizedSelection = selection(value, false);
  const method = requireString("method", value.method, { max: 30 }).toUpperCase();
  if (!["CASH", "BANK_TRANSFER", "CARD"].includes(method)) invalid("method");
  return {
    ...normalizedSelection,
    method,
    idempotencyKey: normalizeIdempotencyKey(value.idempotencyKey)
  };
}

export function serviceRoundsQuery(query) {
  const value = requireObject(query);
  const bookingRoomId = Number(value.bookingRoomId);
  return {
    bookingRoomId: integer(bookingRoomId, "bookingRoomId", 1, Number.MAX_SAFE_INTEGER),
    date: nullableDate(value.date) || invalid("date")
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

function time(value, field) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    invalid(field);
  }
  return value.length === 5 ? `${value}:00` : value;
}

function invalid(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}
