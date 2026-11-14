import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { reserveTourSeats } from "../server/tours.js";
import { resetTestDatabase } from "./reset.js";

test("tour capacity is shared across bookings", async () => {
  await resetTestDatabase();
  await seed();
  const [c] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Tour Guest", "000", "MOCK"],
  );
  try {
    const input = {
      customerId: c.insertId,
      rooms: [{ typeId: 1, guests: 1 }],
      checkIn: "2027-08-01",
      checkOut: "2027-08-03",
      services: {},
    };
    const a = await withTransaction((x) => createBookingHold(x, input));
    const b = await withTransaction((x) => createBookingHold(x, input));
    const [slot] = await pool.execute(
      "INSERT INTO tour_slots (tour_date,time_label,capacity) VALUES (?,?,?)",
      ["2027-08-01", "15:00:00", 1],
    );
    const result = await Promise.allSettled([
      withTransaction((x) =>
        reserveTourSeats(x, {
          bookingId: a.id,
          slotId: slot.insertId,
          participants: ["A"],
        }),
      ),
      withTransaction((x) =>
        reserveTourSeats(x, {
          bookingId: b.id,
          slotId: slot.insertId,
          participants: ["B"],
        }),
      ),
    ]);
    assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  } finally {
    /* the next case uses the same test pool */
  }
});

test("repeat tour use in one request gets the lower price and post-arrival charge is paid immediately", async () => {
  await resetTestDatabase();
  await seed();
  const [customer] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Tour Guest", "000", "MOCK"],
  );
  try {
    const booking = await withTransaction((connection) =>
      createBookingHold(connection, {
        customerId: customer.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2027-08-01",
        checkOut: "2027-08-03",
        services: {},
      }),
    );
    await pool.execute("UPDATE bookings SET status='checked_in' WHERE id=?", [
      booking.id,
    ]);
    const [slot] = await pool.execute(
      "INSERT INTO tour_slots (tour_date,time_label,capacity) VALUES (?,?,?)",
      ["2027-08-01", "15:00:00", 10],
    );
    const [[reception]] = await pool.query(
      "SELECT id FROM accounts WHERE role='reception' LIMIT 1",
    );
    const result = await withTransaction((connection) =>
      reserveTourSeats(connection, {
        bookingId: booking.id,
        slotId: slot.insertId,
        participants: ["A", "A"],
        actorId: reception.id,
      }),
    );
    assert.deepEqual(result.prices, [50, 20]);
    const [[payment]] = await pool.execute(
      "SELECT amount,status FROM payments WHERE booking_id=? AND method='reception_demo'",
      [booking.id],
    );
    assert.equal(payment.amount, 70);
    assert.equal(payment.status, "approved");
  } finally {
    await pool.end();
  }
});
