import { readFile } from "node:fs/promises";
import path from "node:path";

import { ApiError } from "../../middleware/errors.js";
import {
  normalizeIdempotencyKey,
  paymentQueueQuery,
  rejectionReason,
  routeId,
  settlementPreviewQuery,
  settlementReceipt,
  summaryPeriod,
  verifiedReceipt
} from "./contracts.js";
import { removeUploadedProof } from "./upload.js";

export class PaymentsService {
  constructor(repository, { storageRoot }) {
    this.repository = repository;
    this.storageRoot = path.resolve(storageRoot);
  }

  async submitInitialProof(bookingIdValue, body, file, principal) {
    try {
      const result = await this.repository.submitInitialProof({
        bookingId: routeId(bookingIdValue, "bookingId"),
        customerId: principal.id,
        idempotencyKey: normalizeIdempotencyKey(body?.idempotencyKey),
        proofReference: file.reference
      });
      if (result.replayed) await removeUploadedProof(file);
      return result;
    } catch (error) {
      await removeUploadedProof(file);
      throw error;
    }
  }

  async resubmitProof(bookingIdValue, body, file, principal) {
    try {
      const result = await this.repository.resubmitProof({
        bookingId: routeId(bookingIdValue, "bookingId"),
        customerId: principal.id,
        idempotencyKey: normalizeIdempotencyKey(body?.idempotencyKey),
        proofReference: file.reference
      });
      if (result.replayed) await removeUploadedProof(file);
      return result;
    } catch (error) {
      await removeUploadedProof(file);
      throw error;
    }
  }

  async listAccounting(query) {
    return this.repository.listAccounting(paymentQueueQuery(query));
  }

  async getAccounting(paymentIdValue) {
    return this.repository.getAccounting(routeId(paymentIdValue, "paymentId"));
  }

  async getProof(paymentIdValue, principal) {
    const record = await this.repository.getProofAccess(routeId(paymentIdValue, "paymentId"));
    if (!record) throw proofNotFound();
    if (principal.type === "customer") {
      if (record.customerId !== principal.id) throw proofNotFound();
    } else if (!["accounting", "superadmin", "management"].includes(principal.role)) {
      throw new ApiError(403, "ROLE_FORBIDDEN", "Your role cannot perform this action");
    }
    const match = /^payments\/([0-9a-f-]+)\.(png|jpg|webp)$/.exec(record.proofReference ?? "");
    if (!match) throw proofNotFound();
    const absolutePath = path.resolve(this.storageRoot, record.proofReference);
    const paymentRoot = path.resolve(this.storageRoot, "payments");
    if (!absolutePath.startsWith(`${paymentRoot}${path.sep}`)) throw proofNotFound();
    let data;
    try {
      data = await readFile(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") throw proofNotFound();
      throw error;
    }
    return {
      data,
      contentType: { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[match[2]]
    };
  }

  async approve(paymentIdValue, principal) {
    return this.repository.decide({
      paymentId: routeId(paymentIdValue, "paymentId"),
      employeeId: principal.id,
      decision: "VERIFIED",
      reason: null
    });
  }

  async reject(paymentIdValue, body, principal) {
    return this.repository.decide({
      paymentId: routeId(paymentIdValue, "paymentId"),
      employeeId: principal.id,
      decision: "REJECTED",
      reason: rejectionReason(body)
    });
  }

  async recordReceipt(bookingIdValue, body, principal) {
    return this.repository.recordReceipt({
      bookingId: routeId(bookingIdValue, "bookingId"),
      employeeId: principal.id,
      ...verifiedReceipt(body)
    });
  }

  previewSettlement(query) {
    return this.repository.previewSettlement(settlementPreviewQuery(query));
  }

  async settleStay(bookingIdValue, action, body, file, principal) {
    try {
      const result = await this.repository.settleStay({
        bookingId: routeId(bookingIdValue, "bookingId"),
        action,
        employeeId: principal.id,
        proofReference: file?.reference ?? null,
        ...settlementReceipt(body ?? {})
      });
      if ((result.replayed || !result.data?.payment) && file) await removeUploadedProof(file);
      return result;
    } catch (error) {
      if (file) await removeUploadedProof(file);
      throw error;
    }
  }

  async financialSummary(query) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    return this.repository.financialSummary(summaryPeriod(query, today));
  }
}

function proofNotFound() {
  return new ApiError(404, "PROOF_NOT_FOUND", "Payment proof was not found");
}
