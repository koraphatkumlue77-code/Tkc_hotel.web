import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export function roundInput(body) {
  const value = requireObject(body);
  const status = requireString("status", value.status, { max: 20 }).toUpperCase();
  if (!["OPEN", "CLOSED", "CANCELLED"].includes(status)) invalid("status");
  const start = requireString("startTime", value.startTime, { max: 8 });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(start)) invalid("startTime");
  return {
    serviceId: integer(value.serviceId, "serviceId", 1, Number.MAX_SAFE_INTEGER),
    tourDate: date(value.tourDate, "tourDate"),
    startTime: start.length === 5 ? `${start}:00` : start,
    capacity: integer(value.capacity, "capacity", 1, 1000),
    status
  };
}

export function tourParticipant(body) {
  const value = requireObject(body);
  const participantCode = requireString("participantCode", value.participantCode, { max: 100 }).toUpperCase();
  if (!/^[A-Z0-9._:-]+$/.test(participantCode)) invalid("participantCode");
  return {
    tourRoundId: integer(value.tourRoundId, "tourRoundId", 1, Number.MAX_SAFE_INTEGER),
    participantCode,
    participantName: value.participantName == null || value.participantName === "" ? null : requireString("participantName", value.participantName, { max: 150 })
  };
}

export function tourParty(body) {
  const value = requireObject(body);
  return {
    tourRoundId: integer(value.tourRoundId, "tourRoundId", 1, Number.MAX_SAFE_INTEGER),
    bookingRoomId: integer(value.bookingRoomId, "bookingRoomId", 1, Number.MAX_SAFE_INTEGER),
    quantity: integer(value.quantity, "quantity", 1, 10)
  };
}

export function roundsQuery(query, today) {
  const from = date(query.from ?? today, "from");
  const to = date(query.to ?? from, "to");
  if (to < from || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 90) invalid("to");
  return { from, to };
}

function date(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(field);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalid(field);
  return value;
}
function integer(value, field, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) invalid(field); return value; }
function invalid(field) { throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", { fields: { [field]: "Invalid value" } }); }
