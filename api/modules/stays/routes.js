// HTTP endpoints สำหรับจัดห้อง Check-in/Check-out และย้ายห้องฉุกเฉิน
import { Router } from "express";

import { requireRoles } from "../auth/session.js";
import { StaysRepository } from "./repository.js";
import { StaysService } from "./service.js";

export function createStaysModule({ pool, authenticate }) {
  const service = new StaysService(new StaysRepository(pool));
  const router = Router();

  router.get("/staff/bookings/:bookingId/available-rooms", authenticate,
    requireRoles("reception", "superadmin"), asyncHandler(async (request, response) => {
      const data = await service.listAvailableRooms(request.params.bookingId, request.query.bookingRoomId);
      response.json({ data });
    }));
  router.post("/staff/bookings/:bookingId/assignments", authenticate,
    requireRoles("reception", "superadmin"), asyncHandler(async (request, response) => {
      response.status(201).json({ data: await service.assign(request.params.bookingId, request.body, request.principal) });
    }));
  router.post("/staff/bookings/:bookingId/check-in", authenticate,
    requireRoles("reception", "superadmin"), asyncHandler(async (request, response) => {
      response.json({ data: await service.checkIn(request.params.bookingId, request.principal) });
    }));
  router.post("/staff/bookings/:bookingId/no-show", authenticate,
    requireRoles("reception", "superadmin"), asyncHandler(async (request, response) => {
      response.json({ data: await service.noShow(request.params.bookingId, request.body, request.principal) });
    }));
  router.post("/staff/bookings/:bookingId/emergency-moves", authenticate,
    requireRoles("reception"), asyncHandler(async (request, response) => {
      response.status(201).json({ data: await service.requestEmergencyMove(request.params.bookingId, request.body, request.principal) });
    }));
  router.post("/management/emergency-moves/:assignmentId/approve", authenticate,
    requireRoles("management"), asyncHandler(async (request, response) => {
      response.json({ data: await service.decideEmergencyMove(request.params.assignmentId, "APPROVED", request.body, request.principal) });
    }));
  router.post("/management/emergency-moves/:assignmentId/reject", authenticate,
    requireRoles("management"), asyncHandler(async (request, response) => {
      response.json({ data: await service.decideEmergencyMove(request.params.assignmentId, "REJECTED", request.body, request.principal) });
    }));
  router.post("/staff/bookings/:bookingId/check-out", authenticate,
    requireRoles("reception", "superadmin"), asyncHandler(async (request, response) => {
      response.json({ data: await service.checkOut(request.params.bookingId, request.principal) });
    }));

  return { router };
}

function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}
