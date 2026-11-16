import { Router } from "express";

import { RoomsRepository } from "./repository.js";
import { RoomsService } from "./service.js";
import { requireRoles } from "../auth/session.js";

export function createRoomsModule({ pool, authenticate }) {
  const service = new RoomsService(new RoomsRepository(pool));
  const router = Router();

  router.get("/room-types", asyncHandler(async (_request, response) => {
    const roomTypes = await service.listRoomTypes();
    response.json({ data: roomTypes });
  }));

  router.get("/rooms/availability", asyncHandler(async (request, response) => {
    const availability = await service.findAvailability(request.query);
    response.json({ data: availability });
  }));

  router.get(
    "/staff/rooms",
    authenticate,
    requireRoles("reception", "accounting", "housekeeping", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      const result = await service.listStaffRooms(request.query);
      response.json(result);
    })
  );

  router.patch(
    "/staff/rooms/:roomId/status",
    authenticate,
    requireRoles("reception", "housekeeping", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      const room = await service.updateRoomStatus(
        request.params.roomId,
        request.body,
        request.principal
      );
      response.json({ data: room });
    })
  );

  router.post(
    "/staff/room-types",
    authenticate,
    requireRoles("superadmin"),
    asyncHandler(async (request, response) => {
      const record = await service.createRoomType(request.body, request.principal);
      response.status(201).json({ data: record });
    })
  );

  router.patch(
    "/staff/room-types/:roomTypeId",
    authenticate,
    requireRoles("superadmin"),
    asyncHandler(async (request, response) => {
      const record = await service.updateRoomType(
        request.params.roomTypeId,
        request.body,
        request.principal
      );
      response.json({ data: record });
    })
  );

  router.post(
    "/staff/rooms",
    authenticate,
    requireRoles("superadmin"),
    asyncHandler(async (request, response) => {
      const record = await service.createRoom(request.body, request.principal);
      response.status(201).json({ data: record });
    })
  );

  router.patch(
    "/staff/rooms/:roomId",
    authenticate,
    requireRoles("superadmin"),
    asyncHandler(async (request, response) => {
      const record = await service.updateRoomCatalog(
        request.params.roomId,
        request.body,
        request.principal
      );
      response.json({ data: record });
    })
  );

  return { router };
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
