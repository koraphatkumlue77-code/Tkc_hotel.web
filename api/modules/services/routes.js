import { Router } from "express";

import { requireRoles } from "../auth/session.js";
import { ServicesRepository } from "./repository.js";
import { ServicesService } from "./service.js";

export function createServicesModule({ pool, authenticate }) {
  const service = new ServicesService(new ServicesRepository(pool));
  const router = Router();

  router.get("/services", asyncHandler(async (_request, response) => {
    response.json({ data: await service.list() });
  }));
  router.post("/bookings/:bookingId/services", authenticate, requireRoles("customer"),
    asyncHandler(async (request, response) => {
      response.status(201).json({ data: await service.addMine(request.params.bookingId, request.body, request.principal) });
    }));
  router.post("/bookings/:bookingId/services/:bookingServiceId/cancel", authenticate, requireRoles("customer"),
    asyncHandler(async (request, response) => {
      response.json({ data: await service.cancelMine(
        request.params.bookingId, request.params.bookingServiceId, request.principal
      ) });
    }));
  router.post("/staff/bookings/:bookingId/services", authenticate, requireRoles("reception", "superadmin"),
    asyncHandler(async (request, response) => {
      const result = await service.addStaff(request.params.bookingId, request.body, request.principal);
      response.status(result.replayed ? 200 : 201).json({ data: result.data, meta: { replayed: result.replayed } });
    }));
  return { router };
}

function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}
