import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";
import { normalizeIdempotencyKey } from "../payments/contracts.js";

export function refundRequest(body) {
  const value = requireObject(body); const amount = typeof value.amount === "string" ? value.amount.trim() : "";
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) invalid("amount");
  return { amount: Number(amount).toFixed(2), reason: requireString("reason", value.reason, { max: 250 }) };
}
export function refundDecision(body) { return { reason: requireString("reason", requireObject(body).reason, { max: 250 }) }; }
export function refundPayout(body) {
  const value = requireObject(body); const method = requireString("method", value.method, { max: 30 }).toUpperCase();
  if (!["CASH", "BANK_TRANSFER", "CARD"].includes(method)) invalid("method");
  return { method, idempotencyKey: normalizeIdempotencyKey(value.idempotencyKey) };
}
export function refundsQuery(query) {
  return {
    page: queryInteger(query.page ?? "1", "page", 1, 100000),
    limit: queryInteger(query.limit ?? "20", "limit", 1, 100)
  };
}
function queryInteger(value, field, min, max) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) invalid(field);
  const number = Number(value); if (!Number.isSafeInteger(number) || number < min || number > max) invalid(field); return number;
}
function invalid(field) { throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", { fields: { [field]: "Invalid value" } }); }
