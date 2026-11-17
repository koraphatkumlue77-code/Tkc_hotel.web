import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export function damageInput(body) {
  const value = requireObject(body);
  return {
    expectedVersion: version(value.expectedVersion),
    item: requireString("item", value.item, { max: 150 }),
    description: requireString("description", value.description, { max: 2000 })
  };
}
export function closureInput(body) {
  const value = requireObject(body); const effectiveFrom = timestamp(value.effectiveFrom, "effectiveFrom"); const effectiveTo = timestamp(value.effectiveTo, "effectiveTo");
  if (effectiveFrom && effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) invalid("effectiveTo");
  return { expectedVersion: version(value.expectedVersion), reason: requireString("reason", value.reason, { max: 250 }), effectiveFrom, effectiveTo };
}
export function reopenInput(body) { const value = requireObject(body); return { expectedVersion: version(value.expectedVersion), reason: requireString("reason", value.reason, { max: 250 }) }; }
export function decisionReason(body) { return { reason: requireString("reason", requireObject(body).reason, { max: 500 }) }; }
export function historyQuery(query) { return { page: queryInt(query.page ?? "1", "page", 1, 100000), limit: queryInt(query.limit ?? "20", "limit", 1, 100) }; }
function version(value) { const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value; if (!Number.isSafeInteger(number) || number < 0) invalid("expectedVersion"); return number; }
function timestamp(value, field) { if (value == null || value === "") return null; if (typeof value !== "string" || Number.isNaN(Date.parse(value))) invalid(field); return new Date(value).toISOString(); }
function queryInt(value, field, min, max) { if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) invalid(field); const number = Number(value); if (!Number.isSafeInteger(number) || number < min || number > max) invalid(field); return number; }
function invalid(field) { throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", { fields: { [field]: "Invalid value" } }); }
