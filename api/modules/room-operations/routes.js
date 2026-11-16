import { Router } from "express";
import { requireRoles } from "../auth/session.js";
import { RoomOperationsRepository } from "./repository.js";
import { RoomOperationsService } from "./service.js";
import { createDamageUpload, privateHeaders } from "./upload.js";

export function createRoomOperationsModule({ pool, authenticate, storageRoot }) {
  const service = new RoomOperationsService(new RoomOperationsRepository(pool), { storageRoot }); const router = Router(); const upload = createDamageUpload({ storageRoot });
  router.get("/housekeeping/cleaning", authenticate, requireRoles("housekeeping","reception","management","superadmin"), asyncHandler(async (_q,r) => r.json({ data: await service.listCleaning() })));
  router.post("/housekeeping/cleaning/:eventId/start", authenticate, requireRoles("housekeeping"), asyncHandler(async (q,r) => r.json({ data: await service.start(q.params.eventId, q.principal) })));
  router.post("/housekeeping/cleaning/:eventId/complete", authenticate, requireRoles("housekeeping"), asyncHandler(async (q,r) => r.json({ data: await service.complete(q.params.eventId, q.principal) })));
  router.post("/housekeeping/rooms/:roomId/damages", authenticate, requireRoles("housekeeping"), upload, asyncHandler(async (q,r) => r.status(201).json({ data: await service.reportDamage(q.params.roomId, q.body, q.file, q.principal) })));
  router.get("/room-events/:eventId/photo", authenticate, requireRoles("housekeeping","reception","management","superadmin"), asyncHandler(async (q,r) => { const photo = await service.photo(q.params.eventId); r.set(privateHeaders()); r.type(photo.type).send(photo.data); }));
  router.get("/management/damages", authenticate, requireRoles("management","superadmin","housekeeping","reception"), asyncHandler(async (_q,r) => r.json({ data: await service.listDamages() })));
  router.post("/management/damages/:eventId/review", authenticate, requireRoles("management"), asyncHandler(async (q,r) => r.status(201).json({ data: await service.review(q.params.eventId, q.body, q.principal) })));
  router.post("/management/damages/:eventId/resolve", authenticate, requireRoles("management"), asyncHandler(async (q,r) => r.status(201).json({ data: await service.resolve(q.params.eventId, q.body, q.principal) })));
  router.post("/management/rooms/:roomId/closures", authenticate, requireRoles("management"), asyncHandler(async (q,r) => r.status(201).json({ data: await service.close(q.params.roomId, q.body, q.principal) })));
  router.post("/management/room-closures/:eventId/reopen", authenticate, requireRoles("management"), asyncHandler(async (q,r) => r.json({ data: await service.reopen(q.params.eventId, q.body, q.principal) })));
  router.get("/staff/rooms/:roomId/history", authenticate, requireRoles("housekeeping","reception","management","superadmin"), asyncHandler(async (q,r) => r.json(await service.history(q.params.roomId, q.query))));
  return { router };
}
function asyncHandler(handler) { return (request,response,next) => Promise.resolve(handler(request,response,next)).catch(next); }
