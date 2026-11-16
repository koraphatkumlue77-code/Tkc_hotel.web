import { Router } from "express";

import { requireRoles } from "../auth/session.js";
import { PaymentsRepository } from "./repository.js";
import { PaymentsService } from "./service.js";
import { createProofUpload, proofResponseHeaders } from "./upload.js";

export function createPaymentsModule({ pool, authenticate, storageRoot }) {
  const service = new PaymentsService(new PaymentsRepository(pool), { storageRoot });
  const uploadProof = createProofUpload({ storageRoot });
  const router = Router();

  router.post(
    "/bookings/:bookingId/payment-proof",
    authenticate,
    requireRoles("customer"),
    uploadProof,
    asyncHandler(async (request, response) => {
      const result = await service.submitInitialProof(
        request.params.bookingId,
        request.body,
        request.file,
        request.principal
      );
      response.status(result.replayed ? 200 : 201).json({
        data: result.payment,
        meta: { replayed: result.replayed }
      });
    })
  );

  router.get(
    "/accounting/payments",
    authenticate,
    requireRoles("accounting", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      response.json(await service.listAccounting(request.query));
    })
  );

  router.get(
    "/accounting/payments/:paymentId",
    authenticate,
    requireRoles("accounting", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      response.json({ data: await service.getAccounting(request.params.paymentId) });
    })
  );

  router.get(
    "/payments/:paymentId/proof",
    authenticate,
    asyncHandler(async (request, response) => {
      const proof = await service.getProof(request.params.paymentId, request.principal);
      response.set(proofResponseHeaders());
      response.type(proof.contentType).send(proof.data);
    })
  );

  router.post(
    "/accounting/payments/:paymentId/approve",
    authenticate,
    requireRoles("accounting"),
    asyncHandler(async (request, response) => {
      const result = await service.approve(request.params.paymentId, request.principal);
      response.json({ data: result.data, meta: { replayed: result.replayed } });
    })
  );

  router.post(
    "/accounting/payments/:paymentId/reject",
    authenticate,
    requireRoles("accounting"),
    asyncHandler(async (request, response) => {
      const result = await service.reject(request.params.paymentId, request.body, request.principal);
      response.json({ data: result.data, meta: { replayed: result.replayed } });
    })
  );

  router.post(
    "/staff/bookings/:bookingId/payments",
    authenticate,
    requireRoles("reception", "superadmin"),
    asyncHandler(async (request, response) => {
      const result = await service.recordReceipt(
        request.params.bookingId,
        request.body,
        request.principal
      );
      response.status(result.replayed ? 200 : 201).json({
        data: result.payment,
        meta: { replayed: result.replayed }
      });
    })
  );

  router.get(
    "/accounting/financial-summary",
    authenticate,
    requireRoles("accounting", "superadmin", "management"),
    asyncHandler(async (request, response) => {
      response.json(await service.financialSummary(request.query));
    })
  );

  router.post(
    "/bookings/:bookingId/payment-proof/resubmit",
    authenticate,
    requireRoles("customer"),
    uploadProof,
    asyncHandler(async (request, response) => {
      const result = await service.resubmitProof(
        request.params.bookingId,
        request.body,
        request.file,
        request.principal
      );
      response.status(result.replayed ? 200 : 201).json({
        data: result.payment,
        meta: { replayed: result.replayed }
      });
    })
  );

  return { router };
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
