import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import { mkdtemp, readdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

import { createApp } from "../app.js";
import { configFromEnvironment, resetTestDatabase } from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("customer submits server-priced proof and same idempotency key replays without another file", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.owner@example.test", "PAY-OWNER");
    const booking = await fixture.createBooking(owner, "PAY-IDEM-BOOK");
    const first = await fixture.uploadProof(owner, booking.id, "proof-one", PNG);
    assert.equal(first.response.status, 201);
    assert.deepEqual({
      bookingId: first.body.data.bookingId,
      transactionType: first.body.data.transactionType,
      amount: first.body.data.amount,
      status: first.body.data.status,
      replayed: first.body.meta.replayed
    }, {
      bookingId: booking.id,
      transactionType: "DEPOSIT",
      amount: "200.00",
      status: "SUBMITTED",
      replayed: false
    });

    const [[storedBooking]] = await fixture.pool.execute(
      "SELECT status, hold_expires_at AS holdExpiresAt FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.equal(storedBooking.status, "PAYMENT_REVIEW");
    assert.equal(storedBooking.holdExpiresAt, null);
    const [payments] = await fixture.pool.execute(
      "SELECT payment_id AS id, transaction_type AS transactionType, CAST(amount AS CHAR) AS amount, status, proof_reference AS proofReference FROM Payment WHERE booking_id = ?",
      [booking.id]
    );
    assert.equal(payments.length, 1);
    assert.equal(payments[0].proofReference, first.body.data.proofReference);

    const replay = await fixture.uploadProof(owner, booking.id, "proof-one", PNG);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.data.id, first.body.data.id);
    assert.equal(replay.body.meta.replayed, true);
    assert.equal((await fixture.files()).length, 1);

    const [audits] = await fixture.pool.execute(
      "SELECT entity_type AS entityType, action FROM AuditLog WHERE entity_id IN (?, ?) ORDER BY audit_log_id",
      [booking.id, first.body.data.id]
    );
    assert.ok(audits.some(({ entityType, action }) => entityType === "Payment" && action === "PAYMENT_SUBMITTED"));
    assert.ok(audits.some(({ entityType, action }) => entityType === "Booking" && action === "PAYMENT_REVIEW_STARTED"));
  } finally {
    await fixture.close();
  }
});

test("initial deposit excludes service charges deferred to Check-out", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.room-only@example.test", "PAY-ROOM-ONLY");
    const booking = await fixture.createBooking(owner, "PAY-ROOM-ONLY-BOOK");
    await fixture.pool.execute(`
      UPDATE Booking SET service_subtotal_snapshot = 600, total_snapshot = 1600
      WHERE booking_id = ?
    `, [booking.id]);
    const proof = await fixture.uploadProof(owner, booking.id, "room-only-deposit", PNG);
    assert.equal(proof.response.status, 201);
    assert.equal(proof.body.data.amount, "200.00");
  } finally {
    await fixture.close();
  }
});

test("Reception settles room at Check-in and services at Check-out atomically", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.settlement@example.test", "PAY-SETTLEMENT");
    const booking = await fixture.createBooking(owner, "PAY-SETTLEMENT-BOOK");
    const reception = await fixture.employee("payment.settlement.reception@example.test", "RECEPTION");
    const accounting = await fixture.employee("payment.settlement.accounting@example.test", "ACCOUNTING");
    const [[receptionEmployee]] = await fixture.pool.execute(
      "SELECT employee_id AS id FROM Employee WHERE email = ?",
      ["payment.settlement.reception@example.test"]
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await fixture.pool.execute(`
      UPDATE Booking SET status = 'CONFIRMED', check_in_date = ?, check_out_date = ?,
        room_subtotal_snapshot = 1000, service_subtotal_snapshot = 600,
        discount_total_snapshot = 0, total_snapshot = 1600, hold_expires_at = NULL
      WHERE booking_id = ?
    `, [today, tomorrow.toISOString().slice(0, 10), booking.id]);
    await fixture.pool.execute(`
      INSERT INTO Payment
        (booking_id, transaction_type, direction, method, amount, status, submitted_at, verified_at)
      VALUES (?, 'DEPOSIT', 'IN', 'BANK_TRANSFER', 200, 'VERIFIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [booking.id]);
    const [[bookingRoom]] = await fixture.pool.execute(
      "SELECT booking_room_id AS id, room_type_id AS roomTypeId FROM BookingRoom WHERE booking_id = ?",
      [booking.id]
    );
    const [[room]] = await fixture.pool.execute(
      "SELECT room_id AS id FROM Room WHERE room_type_id = ? AND current_status = 'AVAILABLE' ORDER BY room_id LIMIT 1",
      [bookingRoom.roomTypeId]
    );
    await fixture.pool.execute(`
      INSERT INTO RoomAssignment
        (booking_room_id, room_id, assigned_by, effective_from, effective_to, reason)
      VALUES (?, ?, ?, ?, ?, 'Settlement test')
    `, [bookingRoom.id, room.id, receptionEmployee.id, today, tomorrow.toISOString().slice(0, 10)]);

    const checkInPreview = await fixture.getJson(
      reception,
      `/api/staff/settlements/preview?bookingCode=${encodeURIComponent(booking.bookingCode)}&action=CHECK_IN`
    );
    assert.equal(checkInPreview.response.status, 200);
    assert.equal(checkInPreview.body.data.amountDue, "800.00");
    assert.equal(checkInPreview.body.data.serviceDue, "600.00");

    const checkedIn = await fixture.uploadSettlement(
      reception, booking.id, "check-in", "SETTLE-IN-1", "RECEIPT-IN-001", PNG
    );
    assert.equal(checkedIn.response.status, 201);
    assert.equal(checkedIn.body.data.payment.amount, "800.00");
    assert.equal(checkedIn.body.data.payment.status, "SUBMITTED");
    assert.equal(checkedIn.body.data.booking.status, "CHECKED_IN");
    assert.deepEqual(checkedIn.body.data.rooms.map(({ status }) => status), ["OCCUPIED"]);

    const approvedCheckIn = await fixture.postJson(
      accounting, `/api/accounting/payments/${checkedIn.body.data.payment.id}/approve`, {}
    );
    assert.equal(approvedCheckIn.response.status, 200);
    assert.equal(approvedCheckIn.body.data.payment.status, "VERIFIED");
    assert.equal(approvedCheckIn.body.data.booking.status, "CHECKED_IN");

    const checkOutPreview = await fixture.getJson(
      reception,
      `/api/staff/settlements/preview?bookingCode=${encodeURIComponent(booking.bookingCode)}&action=CHECK_OUT`
    );
    assert.equal(checkOutPreview.response.status, 200);
    assert.equal(checkOutPreview.body.data.amountDue, "600.00");

    const checkedOut = await fixture.uploadSettlement(
      reception, booking.id, "check-out", "SETTLE-OUT-1", "RECEIPT-OUT-001", PNG
    );
    assert.equal(checkedOut.response.status, 201);
    assert.equal(checkedOut.body.data.payment.transactionType, "SERVICE_PAYMENT");
    assert.equal(checkedOut.body.data.payment.amount, "600.00");
    assert.equal(checkedOut.body.data.payment.status, "SUBMITTED");
    assert.equal(checkedOut.body.data.booking.status, "CHECKED_OUT");
    assert.deepEqual(checkedOut.body.data.rooms.map(({ status }) => status), ["NEEDS_CLEANING"]);
    const approvedCheckOut = await fixture.postJson(
      accounting, `/api/accounting/payments/${checkedOut.body.data.payment.id}/approve`, {}
    );
    assert.equal(approvedCheckOut.response.status, 200);
    assert.equal(approvedCheckOut.body.data.payment.status, "VERIFIED");
    assert.equal(approvedCheckOut.body.data.booking.status, "CHECKED_OUT");
    const [[stored]] = await fixture.pool.execute(`
      SELECT b.status, r.current_status AS roomStatus,
        JSON_UNQUOTE(JSON_EXTRACT(p.auto_check_result, '$.reference')) AS referenceNumber
      FROM Booking b
      JOIN BookingRoom br ON br.booking_id = b.booking_id
      JOIN RoomAssignment ra ON ra.booking_room_id = br.booking_room_id
      JOIN Room r ON r.room_id = ra.room_id
      JOIN Payment p ON p.booking_id = b.booking_id AND p.transaction_type = 'SERVICE_PAYMENT'
      WHERE b.booking_id = ? ORDER BY p.payment_id DESC LIMIT 1
    `, [booking.id]);
    assert.deepEqual(stored, {
      status: "CHECKED_OUT", roomStatus: "NEEDS_CLEANING", referenceNumber: "RECEIPT-OUT-001"
    });
  } finally {
    await fixture.close();
  }
});

test("proof submission enforces ownership, live hold, state, and cancellation review lock", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.state@example.test", "PAY-STATE");
    const stranger = await fixture.register("payment.stranger@example.test", "PAY-STRANGER");
    const booking = await fixture.createBooking(owner, "PAY-STATE-BOOK");

    const wrongOwner = await fixture.uploadProof(stranger, booking.id, "wrong-owner", PNG);
    assert.equal(wrongOwner.response.status, 404);
    assert.equal((await fixture.files()).length, 0);

    await fixture.pool.execute(
      "UPDATE Booking SET hold_expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND) WHERE booking_id = ?",
      [booking.id]
    );
    const expired = await fixture.uploadProof(owner, booking.id, "expired-proof", PNG);
    assert.equal(expired.response.status, 409);
    assert.equal(expired.body.code, "BOOKING_HOLD_EXPIRED");
    assert.equal((await fixture.files()).length, 0);

    await fixture.pool.execute(
      "UPDATE Booking SET status = 'PAYMENT_REVIEW', hold_expires_at = NULL WHERE booking_id = ?",
      [booking.id]
    );
    const cancel = await fixture.postJson(owner, `/api/bookings/${booking.id}/cancel`, {
      reason: "Cannot cancel review"
    });
    assert.equal(cancel.response.status, 409);

    const wrongState = await fixture.uploadProof(owner, booking.id, "wrong-state", PNG);
    assert.equal(wrongState.response.status, 409);
    assert.equal((await fixture.files()).length, 0);
  } finally {
    await fixture.close();
  }
});

test("proof at the final-room expiry boundary cannot overlap a replacement booking", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.race.owner@example.test", "PAY-RACE-OWNER");
    const replacementCustomer = await fixture.register("payment.race.next@example.test", "PAY-RACE-NEXT");
    await fixture.pool.execute(
      "INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate) VALUES ('Payment Race', 2, 1000, 0)"
    );
    const [[{ roomTypeId }]] = await fixture.pool.query("SELECT LAST_INSERT_ID() AS roomTypeId");
    await fixture.pool.execute(
      "INSERT INTO Room (room_type_id, room_code, current_status) VALUES (?, 'PAYRACE001', 'AVAILABLE')",
      [roomTypeId]
    );
    const booking = await fixture.createBooking(owner, null, roomTypeId);
    await fixture.pool.execute(
      "UPDATE Booking SET hold_expires_at = CURRENT_TIMESTAMP WHERE booking_id = ?",
      [booking.id]
    );

    const [proof, replacement] = await Promise.all([
      fixture.uploadProof(owner, booking.id, "expiry-race", PNG),
      fixture.createBookingRequest(replacementCustomer, roomTypeId)
    ]);
    assert.equal(proof.response.status, 409);
    assert.equal(replacement.response.status, 201);
    assert.equal((await fixture.files()).length, 0);
  } finally {
    await fixture.close();
  }
});

test("rejected proof resubmits within 30 minutes, preserves history, and replays safely", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.resubmit@example.test", "PAY-RESUBMIT");
    const stranger = await fixture.register("payment.resubmit.other@example.test", "PAY-RESUBMIT-OTHER");
    const booking = await fixture.createBooking(owner);
    const initial = await fixture.uploadProof(owner, booking.id, "initial-proof", PNG);
    const initialId = initial.body.data.id;
    await fixture.pool.execute("UPDATE Payment SET status = 'REJECTED', rejection_reason = 'Unreadable' WHERE payment_id = ?", [initialId]);
    await fixture.pool.execute(`
      UPDATE Booking SET status = 'PENDING_PAYMENT',
        hold_expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE)
      WHERE booking_id = ?
    `, [booking.id]);

    const wrongOwner = await fixture.resubmitProof(stranger, booking.id, "replacement-one", PNG);
    assert.equal(wrongOwner.response.status, 404);

    const changedOperation = await fixture.resubmitProof(owner, booking.id, "initial-proof", PNG);
    assert.equal(changedOperation.response.status, 409);
    assert.equal(changedOperation.body.code, "IDEMPOTENCY_CONFLICT");

    const replacement = await fixture.resubmitProof(owner, booking.id, "replacement-one", PNG);
    assert.equal(replacement.response.status, 201);
    assert.equal(replacement.body.data.relatedPaymentId, initialId);
    assert.equal(replacement.body.data.status, "SUBMITTED");
    const replay = await fixture.resubmitProof(owner, booking.id, "replacement-one", PNG);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.data.id, replacement.body.data.id);
    assert.equal(replay.body.meta.replayed, true);
    assert.equal((await fixture.files()).length, 2);

    const [rows] = await fixture.pool.execute(
      "SELECT payment_id AS id, related_payment_id AS relatedPaymentId, status FROM Payment WHERE booking_id = ? ORDER BY payment_id",
      [booking.id]
    );
    assert.deepEqual(rows, [
      { id: initialId, relatedPaymentId: null, status: "REJECTED" },
      { id: replacement.body.data.id, relatedPaymentId: initialId, status: "SUBMITTED" }
    ]);
    const [[storedBooking]] = await fixture.pool.execute(
      "SELECT status, hold_expires_at AS holdExpiresAt FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.equal(storedBooking.status, "PAYMENT_REVIEW");
    assert.equal(storedBooking.holdExpiresAt, null);
  } finally {
    await fixture.close();
  }
});

test("resubmission rejects missing rejection and expired replacement hold without keeping files", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.resubmit.state@example.test", "PAY-RESUBMIT-STATE");
    const booking = await fixture.createBooking(owner);
    const missing = await fixture.resubmitProof(owner, booking.id, "missing-rejection", PNG);
    assert.equal(missing.response.status, 409);
    assert.equal((await fixture.files()).length, 0);

    const initial = await fixture.uploadProof(owner, booking.id, "expiry-initial", PNG);
    await fixture.pool.execute("UPDATE Payment SET status = 'REJECTED' WHERE payment_id = ?", [initial.body.data.id]);
    await fixture.pool.execute(`
      UPDATE Booking SET status = 'PENDING_PAYMENT',
        hold_expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND)
      WHERE booking_id = ?
    `, [booking.id]);
    const expired = await fixture.resubmitProof(owner, booking.id, "expired-replacement", PNG);
    assert.equal(expired.response.status, 409);
    assert.equal(expired.body.code, "BOOKING_HOLD_EXPIRED");
    assert.equal((await fixture.files()).length, 1);
  } finally {
    await fixture.close();
  }
});

test("accounting queue is bounded and protected proofs enforce owner and staff roles", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.queue.owner@example.test", "PAY-QUEUE-OWNER");
    const stranger = await fixture.register("payment.queue.stranger@example.test", "PAY-QUEUE-STRANGER");
    const booking = await fixture.createBooking(owner);
    const submitted = await fixture.uploadProof(owner, booking.id, "queue-proof", PNG);
    assert.equal(submitted.response.status, 201);
    const paymentId = submitted.body.data.id;
    const accounting = await fixture.employee("accounting.queue@example.test", "ACCOUNTING");
    const management = await fixture.employee("management.queue@example.test", "MANAGEMENT");
    const housekeeping = await fixture.employee("housekeeping.queue@example.test", "HOUSEKEEPING");

    const anonymousQueue = await fixture.getJson(null, "/api/accounting/payments");
    assert.equal(anonymousQueue.response.status, 401);
    const deniedQueue = await fixture.getJson(housekeeping, "/api/accounting/payments");
    assert.equal(deniedQueue.response.status, 403);
    const invalidLimit = await fixture.getJson(accounting, "/api/accounting/payments?limit=101");
    assert.equal(invalidLimit.response.status, 400);
    const invalidStatus = await fixture.getJson(accounting, "/api/accounting/payments?status=NOPE");
    assert.equal(invalidStatus.response.status, 400);

    const queue = await fixture.getJson(accounting, "/api/accounting/payments?status=SUBMITTED&page=1&limit=10");
    assert.equal(queue.response.status, 200);
    assert.equal(queue.body.meta.page, 1);
    assert.equal(queue.body.meta.limit, 10);
    assert.equal(queue.body.meta.total, 1);
    assert.equal(queue.body.data[0].id, paymentId);
    assert.equal(queue.body.data[0].booking.id, booking.id);
    assert.equal(queue.body.data[0].customer.email, "payment.queue.owner@example.test");
    assert.equal(Object.hasOwn(queue.body.data[0], "proofReference"), false);

    const detail = await fixture.getJson(management, `/api/accounting/payments/${paymentId}`);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.body.data.id, paymentId);
    assert.equal(detail.body.data.proofUrl, `/api/payments/${paymentId}/proof`);

    const ownerProof = await fixture.getRaw(owner, `/api/payments/${paymentId}/proof`);
    assert.equal(ownerProof.status, 200);
    assert.match(ownerProof.headers.get("cache-control"), /(?:^|,\s*)no-store(?:,|$)/);
    assert.match(ownerProof.headers.get("content-type"), /^image\/png/);
    assert.deepEqual(Buffer.from(await ownerProof.arrayBuffer()), PNG);

    const strangerProof = await fixture.getRaw(stranger, `/api/payments/${paymentId}/proof`);
    assert.equal(strangerProof.status, 404);
    const accountingProof = await fixture.getRaw(accounting, `/api/payments/${paymentId}/proof`);
    assert.equal(accountingProof.status, 200);
    const deniedProof = await fixture.getRaw(housekeeping, `/api/payments/${paymentId}/proof`);
    assert.equal(deniedProof.status, 403);

    const [files] = await fixture.files();
    await unlink(path.join(fixture.storageRoot, "payments", files));
    const missingProof = await fixture.getJson(accounting, `/api/payments/${paymentId}/proof`);
    assert.equal(missingProof.response.status, 404);
    assert.equal(missingProof.body.code, "PROOF_NOT_FOUND");
  } finally {
    await fixture.close();
  }
});

test("accounting decisions atomically approve or reject and replay the first decision", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.decision.owner@example.test", "PAY-DECISION-OWNER");
    const accounting = await fixture.employee("accounting.decision@example.test", "ACCOUNTING");
    const management = await fixture.employee("management.decision@example.test", "MANAGEMENT");

    const approvedBooking = await fixture.createBooking(owner);
    const approvedProof = await fixture.uploadProof(owner, approvedBooking.id, "approve-proof", PNG);
    const denied = await fixture.postJson(management, `/api/accounting/payments/${approvedProof.body.data.id}/approve`, {});
    assert.equal(denied.response.status, 403);
    const approved = await fixture.postJson(accounting, `/api/accounting/payments/${approvedProof.body.data.id}/approve`, {});
    assert.equal(approved.response.status, 200);
    assert.equal(approved.body.data.payment.status, "VERIFIED");
    assert.equal(approved.body.data.booking.status, "CONFIRMED");
    assert.equal(approved.body.meta.replayed, false);
    const approvedReplay = await fixture.postJson(accounting, `/api/accounting/payments/${approvedProof.body.data.id}/approve`, {});
    assert.equal(approvedReplay.response.status, 200);
    assert.equal(approvedReplay.body.meta.replayed, true);
    assert.equal(approvedReplay.body.data.payment.verifiedAt, approved.body.data.payment.verifiedAt);

    const rejectedBooking = await fixture.createBooking(owner);
    const rejectedProof = await fixture.uploadProof(owner, rejectedBooking.id, "reject-proof", PNG);
    const rejected = await fixture.postJson(accounting, `/api/accounting/payments/${rejectedProof.body.data.id}/reject`, {
      reason: "Proof is unreadable"
    });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.body.data.payment.status, "REJECTED");
    assert.equal(rejected.body.data.payment.rejectionReason, "Proof is unreadable");
    assert.equal(rejected.body.data.booking.status, "PENDING_PAYMENT");
    assert.ok(rejected.body.data.booking.holdExpiresAt);
    const rejectedReplay = await fixture.postJson(accounting, `/api/accounting/payments/${rejectedProof.body.data.id}/reject`, {
      reason: "A different reason must not overwrite the first"
    });
    assert.equal(rejectedReplay.response.status, 200);
    assert.equal(rejectedReplay.body.meta.replayed, true);
    assert.equal(rejectedReplay.body.data.payment.rejectionReason, "Proof is unreadable");
    assert.equal(rejectedReplay.body.data.booking.holdExpiresAt, rejected.body.data.booking.holdExpiresAt);

    const [audits] = await fixture.pool.execute(
      "SELECT action FROM AuditLog WHERE entity_type = 'Payment' AND entity_id IN (?, ?) ORDER BY audit_log_id",
      [approvedProof.body.data.id, rejectedProof.body.data.id]
    );
    assert.equal(audits.filter(({ action }) => action === "PAYMENT_VERIFIED").length, 1);
    assert.equal(audits.filter(({ action }) => action === "PAYMENT_REJECTED").length, 1);
  } finally {
    await fixture.close();
  }
});

test("concurrent opposite accounting decisions and cancellation keep Payment and Booking consistent", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.race.decision@example.test", "PAY-RACE-DECISION");
    const accounting = await fixture.employee("accounting.race@example.test", "ACCOUNTING");
    const booking = await fixture.createBooking(owner);
    const proof = await fixture.uploadProof(owner, booking.id, "decision-race", PNG);
    const paymentId = proof.body.data.id;
    const [approve, reject] = await Promise.all([
      fixture.postJson(accounting, `/api/accounting/payments/${paymentId}/approve`, {}),
      fixture.postJson(accounting, `/api/accounting/payments/${paymentId}/reject`, { reason: "Race rejection" })
    ]);
    assert.deepEqual([approve.response.status, reject.response.status].sort(), [200, 409]);
    const [[state]] = await fixture.pool.execute(`
      SELECT p.status AS paymentStatus, b.status AS bookingStatus
      FROM Payment p JOIN Booking b ON b.booking_id = p.booking_id
      WHERE p.payment_id = ?
    `, [paymentId]);
    assert.ok(
      (state.paymentStatus === "VERIFIED" && state.bookingStatus === "CONFIRMED")
      || (state.paymentStatus === "REJECTED" && state.bookingStatus === "PENDING_PAYMENT")
    );

    const cancelBooking = await fixture.createBooking(owner);
    const cancelProof = await fixture.uploadProof(owner, cancelBooking.id, "cancel-race", PNG);
    await Promise.all([
      fixture.postJson(accounting, `/api/accounting/payments/${cancelProof.body.data.id}/approve`, {}),
      fixture.postJson(owner, `/api/bookings/${cancelBooking.id}/cancel`, { reason: "Concurrent cancellation" })
    ]);
    const [[cancelState]] = await fixture.pool.execute(`
      SELECT p.status AS paymentStatus, b.status AS bookingStatus
      FROM Payment p JOIN Booking b ON b.booking_id = p.booking_id
      WHERE p.payment_id = ?
    `, [cancelProof.body.data.id]);
    assert.equal(cancelState.paymentStatus, "VERIFIED");
    assert.ok(["CONFIRMED", "CANCELLED"].includes(cancelState.bookingStatus));
  } finally {
    await fixture.close();
  }
});

test("reception records bounded verified receipts with walk-in full-payment and idempotent replay", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.receipt.owner@example.test", "PAY-RECEIPT-OWNER");
    const accounting = await fixture.employee("accounting.receipt@example.test", "ACCOUNTING");
    const reception = await fixture.employee("reception.receipt@example.test", "RECEPTION");
    const management = await fixture.employee("management.receipt@example.test", "MANAGEMENT");

    const booking = await fixture.createBooking(owner);
    const proof = await fixture.uploadProof(owner, booking.id, "receipt-deposit", PNG);
    await fixture.postJson(accounting, `/api/accounting/payments/${proof.body.data.id}/approve`, {});
    const denied = await fixture.postJson(management, `/api/staff/bookings/${booking.id}/payments`, {
      amount: "300.00", method: "CASH", idempotencyKey: "receipt-denied"
    });
    assert.equal(denied.response.status, 403);
    const receipt = await fixture.postJson(reception, `/api/staff/bookings/${booking.id}/payments`, {
      amount: "300.00", method: "CASH", idempotencyKey: "receipt-partial"
    });
    assert.equal(receipt.response.status, 201);
    assert.equal(receipt.body.data.transactionType, "BALANCE");
    assert.equal(receipt.body.data.status, "VERIFIED");
    assert.equal(receipt.body.data.amount, "300.00");
    assert.equal(receipt.body.data.outstanding, "500.00");
    const replay = await fixture.postJson(reception, `/api/staff/bookings/${booking.id}/payments`, {
      amount: "300.00", method: "CASH", idempotencyKey: "receipt-partial"
    });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.meta.replayed, true);
    assert.equal(replay.body.data.id, receipt.body.data.id);
    const overpayment = await fixture.postJson(reception, `/api/staff/bookings/${booking.id}/payments`, {
      amount: "500.01", method: "CASH", idempotencyKey: "receipt-overpay"
    });
    assert.equal(overpayment.response.status, 409);

    const walkIn = await fixture.createBooking(owner);
    await fixture.pool.execute(
      "UPDATE Booking SET channel = 'WALK_IN', status = 'CONFIRMED', hold_expires_at = NULL WHERE booking_id = ?",
      [walkIn.id]
    );
    const full = await fixture.postJson(reception, `/api/staff/bookings/${walkIn.id}/payments`, {
      amount: "1000.00", method: "BANK_TRANSFER", idempotencyKey: "walkin-full"
    });
    assert.equal(full.response.status, 201);
    assert.equal(full.body.data.transactionType, "FULL_PAYMENT");
    assert.equal(full.body.data.outstanding, "0.00");

    const pending = await fixture.createBooking(owner);
    const wrongState = await fixture.postJson(reception, `/api/staff/bookings/${pending.id}/payments`, {
      amount: "100.00", method: "CASH", idempotencyKey: "pending-receipt"
    });
    assert.equal(wrongState.response.status, 409);
    const invalidMethod = await fixture.postJson(reception, `/api/staff/bookings/${booking.id}/payments`, {
      amount: "1.00", method: "CRYPTO", idempotencyKey: "invalid-method"
    });
    assert.equal(invalidMethod.response.status, 400);
  } finally {
    await fixture.close();
  }
});

test("Bangkok financial summary includes verified legacy incoming money only", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.register("payment.summary.owner@example.test", "PAY-SUMMARY-OWNER");
    const accounting = await fixture.employee("accounting.summary@example.test", "ACCOUNTING");
    const booking = await fixture.createBooking(owner);
    await fixture.pool.execute(
      "UPDATE Booking SET status = 'CONFIRMED', hold_expires_at = NULL WHERE booking_id = ?",
      [booking.id]
    );
    await fixture.pool.execute(`
      INSERT INTO Payment
        (booking_id, transaction_type, direction, method, amount, status, submitted_at)
      VALUES
        (?, 'BALANCE', 'IN', 'CASH', 50, 'VERIFIED', CURRENT_TIMESTAMP),
        (?, 'BALANCE', 'IN', 'CASH', 60, 'APPROVED', CURRENT_TIMESTAMP),
        (?, 'BALANCE', 'IN', 'BANK_TRANSFER', 70, 'COMPLETED', CURRENT_TIMESTAMP),
        (?, 'BALANCE', 'IN', 'CASH', 80, 'SUBMITTED', CURRENT_TIMESTAMP),
        (?, 'BALANCE', 'IN', 'CASH', 90, 'REJECTED', CURRENT_TIMESTAMP),
        (?, 'BALANCE', 'IN', 'CASH', 100, 'CANCELED', CURRENT_TIMESTAMP)
    `, [booking.id, booking.id, booking.id, booking.id, booking.id, booking.id]);
    const [[{ firstPaymentId }]] = await fixture.pool.query("SELECT MIN(payment_id) AS firstPaymentId FROM Payment");
    await fixture.pool.execute(`
      INSERT INTO Payment
        (related_payment_id, booking_id, transaction_type, direction, method, amount, status, submitted_at)
      VALUES (?, ?, 'REFUND_PAYOUT', 'OUT', 'BANK_TRANSFER', 40, 'VERIFIED', CURRENT_TIMESTAMP)
    `, [firstPaymentId, booking.id]);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const summary = await fixture.getJson(accounting, `/api/accounting/financial-summary?from=${today}&to=${today}`);
    assert.equal(summary.response.status, 200);
    assert.equal(summary.body.data.incomingTotal, "180.00");
    assert.equal(summary.body.data.paymentCount, 3);
    assert.deepEqual(summary.body.data.byMethod, [
      { method: "BANK_TRANSFER", amount: "70.00", count: 1 },
      { method: "CASH", amount: "110.00", count: 2 }
    ]);

    const utcConnection = await fixture.pool.getConnection();
    try {
      await utcConnection.query("SET time_zone = '+00:00'");
      await utcConnection.execute(`
        INSERT INTO Payment
          (booking_id, transaction_type, direction, method, amount, status, submitted_at)
        VALUES
          (?, 'BALANCE', 'IN', 'CASH', 11, 'VERIFIED', '2026-01-01 16:59:59'),
          (?, 'BALANCE', 'IN', 'CASH', 13, 'VERIFIED', '2026-01-01 17:00:00')
      `, [booking.id, booking.id]);
    } finally {
      utcConnection.release();
    }
    const midnightBoundary = await fixture.getJson(
      accounting,
      "/api/accounting/financial-summary?from=2026-01-02&to=2026-01-02"
    );
    assert.equal(midnightBoundary.response.status, 200);
    assert.equal(midnightBoundary.body.data.incomingTotal, "13.00");
    assert.equal(midnightBoundary.body.data.paymentCount, 1);

    const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => (
      index % 2 === 0
        ? fixture.pool.execute(`
            INSERT INTO Payment
              (booking_id, transaction_type, direction, method, amount, status, submitted_at)
            VALUES (?, 'BALANCE', 'IN', 'CASH', 1, 'VERIFIED', CURRENT_TIMESTAMP)
          `, [booking.id]).then(() => null)
        : fixture.getJson(accounting, `/api/accounting/financial-summary?from=${today}&to=${today}`)
    )));
    for (const result of concurrent.filter(Boolean)) {
      assert.equal(result.response.status, 200);
      const methodTotal = result.body.data.byMethod.reduce((sum, row) => sum + Number(row.amount), 0);
      const methodCount = result.body.data.byMethod.reduce((sum, row) => sum + row.count, 0);
      assert.equal(methodTotal.toFixed(2), result.body.data.incomingTotal);
      assert.equal(methodCount, result.body.data.paymentCount);
    }
    const invalid = await fixture.getJson(accounting, "/api/accounting/financial-summary?from=2026-99-01&to=2026-01-01");
    assert.equal(invalid.response.status, 400);
  } finally {
    await fixture.close();
  }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tkc-payment-integration-"));
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    storageRoot,
    authConfig: {
      secret: "payment-integration-secret-at-least-32-characters",
      tokenTtlSeconds: 900,
      cookieName: "tkc_session",
      secureCookie: false
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    pool,
    baseUrl,
    storageRoot,
    async register(email, identityNumber) {
      const result = await this.postJson(null, "/api/auth/register", {
        full_name: "Payment Test",
        email,
        phone: "0811111111",
        identity_type: "PASSPORT",
        identity_number: identityNumber,
        password: "PaymentPass123!"
      });
      assert.equal(result.response.status, 201);
      return result.response.headers.get("set-cookie").split(";", 1)[0];
    },
    async createBooking(cookie, _label, roomTypeId = 1) {
      const result = await this.createBookingRequest(cookie, roomTypeId);
      assert.equal(result.response.status, 201);
      return result.body.data;
    },
    async createBookingRequest(cookie, roomTypeId = 1) {
      const result = await this.postJson(cookie, "/api/bookings", {
        checkIn: "2037-07-10",
        checkOut: "2037-07-11",
        rooms: [{ roomTypeId, guestCount: 2 }],
        breakfastDates: [],
        promotionCodes: [],
        paymentChoice: "deposit"
      });
      return result;
    },
    async uploadProof(cookie, bookingId, idempotencyKey, bytes) {
      const form = new FormData();
      form.append("idempotencyKey", idempotencyKey);
      form.append("proof", new Blob([bytes], { type: "image/png" }), "proof.png");
      const response = await fetch(`${baseUrl}/api/bookings/${bookingId}/payment-proof`, {
        method: "POST",
        headers: { Origin: baseUrl, Cookie: cookie },
        body: form
      });
      return { response, body: await response.json() };
    },
    async resubmitProof(cookie, bookingId, idempotencyKey, bytes) {
      const form = new FormData();
      form.append("idempotencyKey", idempotencyKey);
      form.append("proof", new Blob([bytes], { type: "image/png" }), "replacement.png");
      const response = await fetch(`${baseUrl}/api/bookings/${bookingId}/payment-proof/resubmit`, {
        method: "POST",
        headers: { Origin: baseUrl, Cookie: cookie },
        body: form
      });
      return { response, body: await response.json() };
    },
    async uploadSettlement(cookie, bookingId, action, idempotencyKey, reference, bytes) {
      const form = new FormData();
      form.append("method", "BANK_TRANSFER");
      form.append("reference", reference);
      form.append("idempotencyKey", idempotencyKey);
      form.append("proof", new Blob([bytes], { type: "image/png" }), "settlement.png");
      const response = await fetch(`${baseUrl}/api/staff/bookings/${bookingId}/${action}-settlement`, {
        method: "POST",
        headers: { Origin: baseUrl, Cookie: cookie },
        body: form
      });
      return { response, body: await response.json() };
    },
    async postJson(cookie, route, body) {
      const response = await fetch(`${baseUrl}${route}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: baseUrl,
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: JSON.stringify(body)
      });
      return { response, body: response.status === 204 ? null : await response.json() };
    },
    async getJson(cookie, route) {
      const response = await this.getRaw(cookie, route);
      return { response, body: await response.json() };
    },
    async getRaw(cookie, route) {
      return fetch(`${baseUrl}${route}`, {
        headers: { Origin: baseUrl, ...(cookie ? { Cookie: cookie } : {}) }
      });
    },
    async employee(email, role) {
      const password = "PaymentEmployee123!";
      await pool.execute(`
        INSERT INTO Employee
          (department_name, role_name, name, email, password_hash, active)
        VALUES ('Payment Test', ?, 'Payment Staff', ?, ?, TRUE)
      `, [role, email, await bcrypt.hash(password, 4)]);
      const login = await this.postJson(null, "/api/auth/login", {
        account_type: "employee",
        email,
        password
      });
      assert.equal(login.response.status, 200);
      return login.response.headers.get("set-cookie").split(";", 1)[0];
    },
    async files() {
      return readdir(path.join(storageRoot, "payments")).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error));
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await pool.end();
    }
  };
}
