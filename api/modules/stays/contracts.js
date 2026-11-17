import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export function validateAssignment(body) {
  const value = requireObject(body);
  return {
    bookingRoomId: integer(value.bookingRoomId, "bookingRoomId"),
    roomId: integer(value.roomId, "roomId"),
    reason: optionalReason(value.reason)
  };
}

export function validateEmergencyMove(body) {
  const value = validateAssignment(body);
  if (!value.reason) invalid("reason");
  return value;
}

export function validateDecision(body) {
  const value = requireObject(body);
  return { reason: optionalReason(value.reason) };
}

export function validateReason(body) {
  const value = requireObject(body);
  return { reason: optionalReason(value.reason) };
}

function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) invalid(field);
  return value;
}

function optionalReason(value) {
  if (value === undefined || value === null || value === "") return null;
  return requireString("reason", value, { max: 250 });
}

function invalid(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}
