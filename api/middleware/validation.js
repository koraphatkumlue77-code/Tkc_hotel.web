import { ApiError } from "./errors.js";

export function requireString(name, value, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string") throw validationError(name);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw validationError(name);
  return normalized;
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export function requireEmail(name, value) {
  const email = requireString(name, normalizeEmail(value), { max: 255 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError(name);
  return email;
}

export function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  return value;
}

function validationError(field) {
  return new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}
