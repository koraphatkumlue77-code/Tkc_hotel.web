import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { submitPaymentAttempt, reviewPayment } from "../server/payments.js";
import { resetTestDatabase } from "./reset.js";

test("payment remains pending until accounting approves the simulated deposit", async () => {
  await resetTestDatabase();
  await seed();
  const [customer] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Payment Test", "000", "MOCK"],
  );
  try {
    const booking = await withTransaction((c) =>
      createBookingHold(c, {
        customerId: customer.insertId,
        rooms: [{ typeId: 1, guests: 2 }],
        checkIn: "2027-06-01",
        checkOut: "2027-06-03",
        services: {},
      }),
    );
    await assert.rejects(
      withTransaction((c) =>
        submitPaymentAttempt(c, {
          bookingId: booking.id,
          amount: booking.depositDue,
          method: "online_demo",
          channelDetail: "kbank",
        }),
      ),
      (error) => error.status === 400,
    );
    const payment = await withTransaction((c) =>
      submitPaymentAttempt(c, {
        bookingId: booking.id,
        amount: booking.depositDue,
        method: "online_demo",
        channelDetail: "paypal",
      }),
    );
    assert.equal(payment.status, "pending_review");
    const [[storedChannel]] = await pool.execute(
      "SELECT channel_detail FROM payments WHERE id=?",
      [payment.id],
    );
    assert.equal(storedChannel.channel_detail, "paypal");
    const [[held]] = await pool.execute(
      "SELECT status FROM bookings WHERE id=?",
      [booking.id],
    );
    assert.equal(held.status, "pending_review");
    const [[age]] = await pool.execute(
      "SELECT TIMESTAMPDIFF(MINUTE,submitted_at,NOW()) AS minutes FROM payments WHERE id=?",
      [payment.id],
    );
    assert.ok(
      age.minutes >= 0 && age.minutes < 2,
      `payment age must start near zero, got ${age.minutes}`,
    );
    const [accounts] = await pool.query(
      "SELECT id FROM accounts WHERE role='accounting' LIMIT 1",
    );
    await withTransaction((c) =>
      reviewPayment(c, {
        paymentId: payment.id,
        accountantId: accounts[0].id,
        decision: "approved",
      }),
    );
    const [[confirmed]] = await pool.execute(
      "SELECT status FROM bookings WHERE id=?",
      [booking.id],
    );
    assert.equal(confirmed.status, "confirmed");
  } finally {
    await pool.end();
  }
});
