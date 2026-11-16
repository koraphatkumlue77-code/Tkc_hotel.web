import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";

const ROOM_STATUSES = ["AVAILABLE", "OCCUPIED", "NEEDS_CLEANING", "OUT_OF_SERVICE"];

export class RoomsService {
  constructor(repository) {
    this.repository = repository;
  }

  async listRoomTypes() {
    return this.repository.listRoomTypes();
  }

  async findAvailability(query) {
    const input = validateAvailability(query);
    const rows = await this.repository.findAvailability(input);
    return rows.map((row) => {
      const totalRooms = Number(row.totalRooms);
      const reservedRooms = Number(row.reservedRooms);
      const closedRooms = Number(row.closedRooms);
      return {
        ...row,
        totalRooms,
        reservedRooms,
        closedRooms,
        availableRooms: Math.max(0, totalRooms - reservedRooms - closedRooms)
      };
    });
  }

  async listStaffRooms(query) {
    const page = routeInteger(query.page ?? "1", "page", 1, 100000);
    const limit = routeInteger(query.limit ?? "50", "limit", 1, 100);
    const status = query.status === undefined ? null : String(query.status).toUpperCase();
    if (status && !ROOM_STATUSES.includes(status)) validationError("status");
    return {
      data: await this.repository.listStaffRooms({ status, limit, offset: (page - 1) * limit }),
      meta: { page, limit }
    };
  }

  async updateRoomStatus(roomIdValue, body, principal) {
    const roomId = routeInteger(roomIdValue, "roomId", 1, Number.MAX_SAFE_INTEGER);
    const value = requireObject(body);
    const status = requireString("status", value.status, { max: 30 }).toUpperCase();
    if (!ROOM_STATUSES.includes(status)) validationError("status");
    const expectedVersion = jsonInteger(value.expectedVersion, "expectedVersion", 0, Number.MAX_SAFE_INTEGER);
    const reason = requireString("reason", value.reason, { max: 250 });
    return this.repository.updateRoomStatus({
      roomId,
      status,
      expectedVersion,
      reason,
      actorId: principal.id,
      actorRole: principal.role
    });
  }

  async createRoomType(body, principal) {
    return this.repository.createRoomType(validateRoomType(body), principal.id);
  }

  async updateRoomType(id, body, principal) {
    return this.repository.updateRoomType(
      routeInteger(id, "roomTypeId", 1, Number.MAX_SAFE_INTEGER),
      validateRoomType(body),
      principal.id
    );
  }

  async createRoom(body, principal) {
    return this.repository.createRoom(validateRoomCatalog(body, false), principal.id);
  }

  async updateRoomCatalog(id, body, principal) {
    return this.repository.updateRoomCatalog(
      routeInteger(id, "roomId", 1, Number.MAX_SAFE_INTEGER),
      validateRoomCatalog(body, true),
      principal.id
    );
  }
}

function validateAvailability(query) {
  const checkIn = strictDate("checkIn", query.checkIn);
  const checkOut = strictDate("checkOut", query.checkOut);
  if (checkOut <= checkIn) validationError("checkOut");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  if (checkIn < today) validationError("checkIn");
  let guests = null;
  if (query.guests !== undefined) {
    guests = routeInteger(query.guests, "guests", 1, 20);
  }
  return { checkIn, checkOut, guests };
}

function strictDate(field, value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    validationError(field);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    validationError(field);
  }
  return value;
}

function validationError(field) {
  throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
    fields: { [field]: "Invalid value" }
  });
}

function routeInteger(value, field, min, max) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) validationError(field);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) validationError(field);
  return number;
}

function jsonInteger(value, field, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) validationError(field);
  return value;
}

function validateRoomType(body) {
  const value = requireObject(body);
  return {
    name: requireString("name", value.name, { max: 50 }),
    capacity: jsonInteger(value.capacity, "capacity", 1, 20),
    pricePerNight: decimal("pricePerNight", value.pricePerNight),
    breakfastDailyRate: decimal("breakfastDailyRate", value.breakfastDailyRate)
  };
}

function validateRoomCatalog(body, needsVersion) {
  const value = requireObject(body);
  const result = {
    roomTypeId: jsonInteger(value.roomTypeId, "roomTypeId", 1, Number.MAX_SAFE_INTEGER),
    code: requireString("code", value.code, { max: 20 }).toUpperCase(),
    area: value.area == null || value.area === ""
      ? null
      : requireString("area", value.area, { max: 100 })
  };
  if (needsVersion) {
    result.expectedVersion = jsonInteger(value.expectedVersion, "expectedVersion", 0, Number.MAX_SAFE_INTEGER);
  }
  return result;
}

function decimal(field, value) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) validationError(field);
  return Number(value).toFixed(2);
}
