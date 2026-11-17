import assert from "node:assert/strict";
import test from "node:test";
import { refundRequest, refundPayout, refundDecision } from "../modules/refunds/contracts.js";

test("refund contracts normalize requests, decisions, and payouts", () => {
  assert.deepEqual(refundRequest({ amount: " 125.50 ", reason: " Duplicate charge " }), { amount: "125.50", reason: "Duplicate charge" });
  assert.deepEqual(refundDecision({ reason: " Approved exception " }), { reason: "Approved exception" });
  assert.deepEqual(refundPayout({ method: " bank_transfer ", idempotencyKey: " refund-1 " }), { method: "BANK_TRANSFER", idempotencyKey: "REFUND-1" });
});

test("refund contracts reject zero money, missing reason, invalid method, and unsafe key", () => {
  assert.throws(() => refundRequest({ amount: "0", reason: "x" }), (error) => error.status === 400);
  assert.throws(() => refundDecision({ reason: " " }), (error) => error.status === 400);
  assert.throws(() => refundPayout({ method: "CRYPTO", idempotencyKey: "bad key" }), (error) => error.status === 400);
});
