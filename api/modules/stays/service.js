import { ApiError } from "../../middleware/errors.js";
import {
  validateAssignment,
  validateDecision,
  validateEmergencyMove,
  validateReason
} from "./contracts.js";

export class StaysService {
  constructor(repository) {
    this.repository = repository;
  }

  assign(bookingId, body, principal) {
    return this.repository.assign(routeId(bookingId, "bookingId"), validateAssignment(body), principal);
  }

  checkIn(bookingId, principal) {
    return this.repository.checkIn(routeId(bookingId, "bookingId"), principal);
  }

  noShow(bookingId, body, principal) {
    return this.repository.noShow(routeId(bookingId, "bookingId"), validateReason(body), principal);
  }

  requestEmergencyMove(bookingId, body, principal) {
    return this.repository.requestEmergencyMove(
      routeId(bookingId, "bookingId"),
      validateEmergencyMove(body),
      principal
    );
  }

  decideEmergencyMove(assignmentId, decision, body, principal) {
    return this.repository.decideEmergencyMove(
      routeId(assignmentId, "assignmentId"),
      decision,
      validateDecision(body),
      principal
    );
  }

  checkOut(bookingId, principal) {
    return this.repository.checkOut(routeId(bookingId, "bookingId"), principal);
  }
}

function routeId(value, field) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
      fields: { [field]: "Invalid value" }
    });
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed");
  return id;
}
