// HTTP endpoints สำหรับสร้าง/อ่าน/ยกเลิกการจองและรายละเอียด; กติกา/SQL อยู่ service.js และ repository.js
import { Router } from "express";

import { requireRoles } from "../auth/session.js";
import { BookingsRepository } from "./repository.js";
import { BookingsService } from "./service.js";

export function createBookingsModule({ pool, authenticate }) {
  const service = new BookingsService(new BookingsRepository(pool));
  const router = Router();

  router.post(
    "/bookings",
    authenticate,
    requireRoles("customer"),
    asyncHandler(async (request, response) => {
      const booking = await service.createCustomerBooking(request.body, request.principal);
      response.status(201).json({ data: booking });
    })
  );

  router.get(
    "/bookings/mine",
    authenticate,
    requireRoles("customer"),
    asyncHandler(async (request, response) => {
      response.json(await service.listMine(request.query, request.principal));
    })
  );

  router.post(
    "/bookings/:bookingId/cancel",
    authenticate,
    requireRoles("customer"),
    asyncHandler(async (request, response) => {
      const booking = await service.cancelMine(
        request.params.bookingId,
        request.body,
        request.principal
      );
      response.json({ data: booking });
    })
  );

  router.post(
    "/bookings/:bookingId/late-arrival",
    authenticate,
    requireRoles("customer"),
    asyncHandler(async (request, response) => {
      const booking = await service.declareLateArrival(
        request.params.bookingId,
        request.body,
        request.principal
      );
      response.json({ data: booking });
    })
  );

  router.get(
    "/bookings/:bookingId",
    authenticate,
    requireRoles("customer"),
    asyncHandler(async (request, response) => {
      response.json({ data: await service.getMine(request.params.bookingId, request.principal) });
    })
  );

  router.post(
    "/staff/bookings/walk-in",
    authenticate,
    requireRoles("reception", "superadmin"),
    asyncHandler(async (request, response) => {
      const booking = await service.createWalkIn(request.body, request.principal);
      response.status(201).json({ data: booking });
    })
  );

  router.get(
    "/staff/bookings",
    authenticate,
    requireRoles("reception", "accounting", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      response.json(await service.listStaff(request.query));
    })
  );

  router.get(
    "/staff/bookings/:bookingId",
    authenticate,
    requireRoles("reception", "accounting", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      response.json({ data: await service.getStaff(request.params.bookingId) });
    })
  );

  router.post(
    "/staff/bookings/:bookingId/cancel-unpaid",
    authenticate,
    requireRoles("reception", "accounting", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      response.json({ data: await service.cancelUnpaidAsStaff(request.params.bookingId, request.principal) });
    })
  );

  return { router };
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
