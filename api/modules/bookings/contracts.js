import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export function validateCreateBooking(body) {
  const value = requireObject(body);
  const checkIn = strictDate("checkIn", value.checkIn);
  const checkOut = strictDate("checkOut", value.checkOut);
  if (checkOut <= checkIn) validationError("checkOut");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  if (checkIn < today) validationError("checkIn");

  if (!Array.isArray(value.rooms) || value.rooms.length < 1 || value.rooms.length > 10) {
    validationError("rooms");
  }
  const rooms = value.rooms.map((room, index) => {
    requireObject(room);
    return {
      roomTypeId: jsonInteger(`rooms.${index}.roomTypeId`, room.roomTypeId, 1, Number.MAX_SAFE_INTEGER),
      guestCount: jsonInteger(`rooms.${index}.guestCount`, room.guestCount, 1, 20)
    };
  });

  const breakfastDates = uniqueArray("breakfastDates", value.breakfastDates ?? [], 31)
    .map((date) => strictDate("breakfastDates", date));
  if (breakfastDates.some((date) => date <= checkIn || date > checkOut)) {
    validationError("breakfastDates");
  }

  const promotionCodes = uniqueArray("promotionCodes", value.promotionCodes ?? [], 10)
    .map((code) => requireString("promotionCodes", code, { max: 50 }).toUpperCase());
  if (new Set(promotionCodes).size !== promotionCodes.length) validationError("promotionCodes");

  const paymentChoice = value.paymentChoice ?? "deposit";
  if (!["deposit", "full"].includes(paymentChoice)) validationError("paymentChoice");

  return {
    checkIn,
    checkOut,
    nights: Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000),
    rooms,
    breakfastDates,
    promotionCodes,
    paymentChoice
  };
}

function strictDate(field, value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) validationError(field);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    validationError(field);
  }
  return value;
}

function jsonInteger(field, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) validationError(field);
  return value;
}

function uniqueArray(field, value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) validationError(field);
  if (new Set(value).size !== value.length) validationError(field);
  return value;
}

function validationError(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}
