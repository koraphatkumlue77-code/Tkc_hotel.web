import { validateCreateBooking } from "./contracts.js";
import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

export class BookingsService {
  constructor(repository) {
    this.repository = repository;
  }

  async createCustomerBooking(body, principal) {
    return this.repository.createCustomerBooking(
      validateCreateBooking(body),
      principal.id
    );
  }

  async listMine(query, principal) {
    const page = routeInteger(query.page ?? "1", "page", 1, 100000);
    const limit = routeInteger(query.limit ?? "20", "limit", 1, 50);
    return this.repository.listMine(principal.id, { page, limit });
  }

  async getMine(bookingIdValue, principal) {
    const bookingId = routeInteger(bookingIdValue, "bookingId", 1, Number.MAX_SAFE_INTEGER);
    return this.repository.getMine(bookingId, principal.id);
  }

  async cancelMine(bookingIdValue, body, principal) {
    const bookingId = routeInteger(bookingIdValue, "bookingId", 1, Number.MAX_SAFE_INTEGER);
    const value = requireObject(body);
    const reason = requireString("reason", value.reason, { max: 250 });
    return this.repository.cancelMine(bookingId, principal.id, reason);
  }

  async declareLateArrival(bookingIdValue, body, principal) {
    const bookingId = routeInteger(bookingIdValue, "bookingId", 1, Number.MAX_SAFE_INTEGER);
    const value = requireObject(body);
    const expectedArrivalAt = isoTimestamp("expectedArrivalAt", value.expectedArrivalAt);
    return this.repository.declareLateArrival(bookingId, principal.id, expectedArrivalAt);
  }

  async createWalkIn(body, principal) {
    const value = requireObject(body);
    const input = validateCreateBooking(value);
    if (input.checkIn !== todayInBangkok()) validationError("checkIn");
    let customerId = null;
    let customer = null;
    if (value.customerId !== undefined) {
      customerId = jsonInteger(value.customerId, "customerId", 1, Number.MAX_SAFE_INTEGER);
    } else {
      const customerValue = requireObject(value.customer);
      customer = {
        fullName: requireString("customer.fullName", customerValue.fullName, { max: 150 }),
        phone: requireString("customer.phone", customerValue.phone, { max: 20 }),
        identityType: requireString("customer.identityType", customerValue.identityType, { max: 20 }).toUpperCase(),
        identityNumber: requireString("customer.identityNumber", customerValue.identityNumber, { max: 30 }),
        email: customerValue.email == null || customerValue.email === ""
          ? null
          : requireString("customer.email", customerValue.email, { max: 255 }).toLowerCase()
      };
    }
    const roomAssignments = value.roomAssignments ?? [];
    if (!Array.isArray(roomAssignments) || ![0, input.rooms.length].includes(roomAssignments.length)) {
      validationError("roomAssignments");
    }
    for (let index = 0; index < roomAssignments.length; index += 1) {
      roomAssignments[index] = jsonInteger(
        roomAssignments[index],
        `roomAssignments.${index}`,
        1,
        Number.MAX_SAFE_INTEGER
      );
    }
    const assignments = input.rooms.map((_, index) => {
      const roomId = roomAssignments[index];
      return roomId == null ? null : jsonInteger(roomId, "roomAssignments", 1, Number.MAX_SAFE_INTEGER);
    });
    return this.repository.createWalkIn(
      input,
      { customerId, customer, roomAssignments: assignments },
      principal.id
    );
  }

  async listStaff(query) {
    const page = routeInteger(query.page ?? "1", "page", 1, 100000);
    const limit = routeInteger(query.limit ?? "20", "limit", 1, 100);
    const channel = optionalChoice(query.channel, "channel", ["ONLINE", "WALK_IN"]);
    const status = query.status === undefined
      ? null
      : requireString("status", query.status, { max: 50 }).toUpperCase();
    return this.repository.listStaff({ page, limit, channel, status });
  }

  async getStaff(bookingIdValue) {
    const bookingId = routeInteger(bookingIdValue, "bookingId", 1, Number.MAX_SAFE_INTEGER);
    return this.repository.getStaff(bookingId);
  }
}

function routeInteger(value, field, minimum, maximum) {
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

function isoTimestamp(field, value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    validationError(field);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) validationError(field);
  return parsed;
}

function jsonInteger(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) validationError(field);
  return value;
}

function optionalChoice(value, field, choices) {
  if (value === undefined) return null;
  const normalized = requireString(field, value, { max: 30 }).toUpperCase();
  if (!choices.includes(normalized)) validationError(field);
  return normalized;
}

function todayInBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
