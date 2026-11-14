import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { resetTestDatabase } from "./reset.js";

test("a booking keeps its promotion price after management changes the promotion", async () => {
  await resetTestDatabase();
  await seed();
  const [c] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Promo Guest", "000", "MOCK"],
  );
  try {
    await pool.execute(
      "UPDATE promotions SET active=0 WHERE name='Test promo'",
    );
    const [p] = await pool.execute(
      "INSERT INTO promotions (name,percent_off,priority,start_date,end_date) VALUES (?,?,?,?,?)",
      ["Test promo", 10, 1, "2027-11-01", "2027-11-30"],
    );
    const b = await withTransaction((x) =>
      createBookingHold(x, {
        customerId: c.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2027-11-20",
        checkOut: "2027-11-22",
        services: {},
      }),
    );
    assert.equal(b.total, 1800);
    await pool.execute("UPDATE promotions SET percent_off=50 WHERE id=?", [
      p.insertId,
    ]);
    const [[stored]] = await pool.execute(
      "SELECT total FROM bookings WHERE id=?",
      [b.id],
    );
    assert.equal(stored.total, 1800);
  } finally {
    await pool.end();
  }
});
