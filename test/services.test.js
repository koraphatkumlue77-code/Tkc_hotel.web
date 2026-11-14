import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { addServiceAfterCheckIn } from "../server/services.js";
import { resetTestDatabase } from "./reset.js";

test("post-arrival fitness is charged once per room and paid immediately", async () => {
  await resetTestDatabase();
  await seed();
  const [c] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Service Guest", "000", "MOCK"],
  );
  try {
    const b = await withTransaction((x) =>
      createBookingHold(x, {
        customerId: c.insertId,
        rooms: [
          { typeId: 1, guests: 1 },
          { typeId: 4, guests: 2 },
        ],
        checkIn: "2027-12-01",
        checkOut: "2027-12-03",
        services: {},
      }),
    );
    await pool.execute("UPDATE bookings SET status='checked_in' WHERE id=?", [
      b.id,
    ]);
    const [[staff]] = await pool.query(
      "SELECT id FROM accounts WHERE role='reception' LIMIT 1",
    );
    const result = await withTransaction((x) =>
      addServiceAfterCheckIn(x, {
        bookingId: b.id,
        kind: "fitness",
        actorId: staff.id,
      }),
    );
    assert.equal(result.charge, 1000);
    const [[payment]] = await pool.execute(
      "SELECT amount,status FROM payments WHERE booking_id=? AND method='reception_demo' ORDER BY id DESC LIMIT 1",
      [b.id],
    );
    assert.equal(payment.amount, 1000);
    assert.equal(payment.status, "approved");
  } finally {
    await pool.end();
  }
});
