import { Router } from "express";
import { requireRoles } from "../auth/session.js";
import { RefundsRepository } from "./repository.js";
import { RefundsService } from "./service.js";
export function createRefundsModule({ pool, authenticate }) {
  const service = new RefundsService(new RefundsRepository(pool)); const router = Router();
  router.post("/accounting/payments/:paymentId/refund-requests", authenticate, requireRoles("accounting"), asyncHandler(async (request, response) => response.status(201).json({ data: await service.request(request.params.paymentId, request.body, request.principal) })));
  router.get("/management/refunds", authenticate, requireRoles("management", "accounting", "superadmin"), asyncHandler(async (request, response) => response.json(await service.list(request.query))));
  router.post("/management/refunds/:refundId/approve", authenticate, requireRoles("management"), asyncHandler(async (request, response) => response.json({ data: await service.decide(request.params.refundId, "APPROVED", request.body, request.principal) })));
  router.post("/management/refunds/:refundId/reject", authenticate, requireRoles("management"), asyncHandler(async (request, response) => response.json({ data: await service.decide(request.params.refundId, "REJECTED", request.body, request.principal) })));
  router.post("/accounting/refunds/:refundId/payout", authenticate, requireRoles("accounting"), asyncHandler(async (request, response) => { const result = await service.payout(request.params.refundId, request.body, request.principal); response.status(result.replayed ? 200 : 201).json({ data: result.data, meta: { replayed: result.replayed } }); }));
  return { router };
}
function asyncHandler(handler) { return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next); }
