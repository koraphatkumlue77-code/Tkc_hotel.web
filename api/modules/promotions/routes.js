import { Router } from "express";
import { requireRoles } from "../auth/session.js";
import { PromotionsRepository } from "./repository.js";
import { PromotionsService } from "./service.js";

export function createPromotionsModule({ pool, authenticate }) {
  const service = new PromotionsService(new PromotionsRepository(pool));
  const router = Router();
  const catalogRoles = requireRoles("management", "superadmin");
  router.get("/attractions", asyncHandler(async (_request, response) => response.json({ data: await service.listAttractions() })));
  router.get("/staff/promotions", authenticate, catalogRoles,
    asyncHandler(async (_request, response) => response.json({ data: await service.listPromotions() })));
  router.post("/staff/promotions", authenticate, catalogRoles,
    asyncHandler(async (request, response) => response.status(201).json({ data: await service.createPromotion(request.body, request.principal) })));
  router.patch("/staff/promotions/:promotionId", authenticate, catalogRoles,
    asyncHandler(async (request, response) => response.json({ data: await service.updatePromotion(request.params.promotionId, request.body, request.principal) })));
  router.post("/staff/attractions", authenticate, catalogRoles,
    asyncHandler(async (request, response) => response.status(201).json({ data: await service.createAttraction(request.body, request.principal) })));
  router.patch("/staff/attractions/:serviceId", authenticate, catalogRoles,
    asyncHandler(async (request, response) => response.json({ data: await service.updateAttraction(request.params.serviceId, request.body, request.principal) })));
  return { router };
}

function asyncHandler(handler) { return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next); }
