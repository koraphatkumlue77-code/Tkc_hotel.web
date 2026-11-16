import { Router } from "express";
import { requireRoles } from "../auth/session.js";
import { ToursRepository } from "./repository.js";
import { ToursService } from "./service.js";

export function createToursModule({ pool, authenticate }) {
  const service = new ToursService(new ToursRepository(pool)); const router = Router();
  router.get("/tours/rounds", asyncHandler(async (request, response) => response.json({ data: await service.listRounds(request.query) })));
  router.post("/staff/tours/rounds", authenticate, requireRoles("management", "superadmin"), asyncHandler(async (request, response) => response.status(201).json({ data: await service.createRound(request.body, request.principal) })));
  router.patch("/staff/tours/rounds/:roundId", authenticate, requireRoles("management", "superadmin"), asyncHandler(async (request, response) => response.json({ data: await service.updateRound(request.params.roundId, request.body, request.principal) })));
  router.post("/bookings/:bookingId/tours", authenticate, requireRoles("customer"), asyncHandler(async (request, response) => response.status(201).json({ data: await service.add(request.params.bookingId, request.body, request.principal) })));
  router.post("/bookings/:bookingId/tours/party", authenticate, requireRoles("customer"), asyncHandler(async (request, response) => response.status(201).json({ data: await service.addParty(request.params.bookingId, request.body, request.principal) })));
  router.post("/bookings/:bookingId/tours/:reservationId/cancel", authenticate, requireRoles("customer"), asyncHandler(async (request, response) => response.json({ data: await service.cancel(request.params.bookingId, request.params.reservationId, request.principal) })));
  return { router };
}
function asyncHandler(handler) { return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next); }
