import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export function routeId(value, field = "id") {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) validationError(field);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) validationError(field);
  return number;
}

export function normalizeIdempotencyKey(value) {
  const key = requireString("idempotencyKey", value, { max: 100 }).toUpperCase();
  if (!/^[A-Z0-9._:-]+$/.test(key)) validationError("idempotencyKey");
  return key;
}

export function paymentQueueQuery(query) {
  const page = boundedInteger(query.page ?? "1", "page", 1, 100000);
  const limit = boundedInteger(query.limit ?? "20", "limit", 1, 100);
  const status = query.status === undefined ? null : String(query.status).toUpperCase();
  if (status && !["SUBMITTED", "VERIFIED", "REJECTED", "APPROVED", "COMPLETED"].includes(status)) {
    validationError("status");
  }
  return { page, limit, status };
}

export function rejectionReason(body) {
  return requireString("reason", requireObject(body).reason, { max: 250 });
}

export function verifiedReceipt(body) {
  const value = requireObject(body);
  const amount = typeof value.amount === "string" ? value.amount.trim() : "";
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) validationError("amount");
  const method = requireString("method", value.method, { max: 30 }).toUpperCase();
  if (!["CASH", "BANK_TRANSFER", "CARD"].includes(method)) validationError("method");
  return {
    amount,
    method,
    idempotencyKey: normalizeIdempotencyKey(value.idempotencyKey)
  };
}

export function summaryPeriod(query, today) {
  const from = query.from ?? today;
  const to = query.to ?? today;
  if (!validDate(from)) validationError("from");
  if (!validDate(to)) validationError("to");
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (fromTime > toTime || (toTime - fromTime) / 86400000 > 366) validationError("to");
  return { from, to };
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function boundedInteger(value, field, minimum, maximum) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) validationError(field);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) validationError(field);
  return number;
}

function validationError(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}
