import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { hashPassword } from "../server/auth.js";
import { createBookingHold } from "../server/bookings.js";
import { createReview } from "../server/content.js";
import { resetTestDatabase } from "./reset.js";

test("only the checked-in member booker can write multiple reviews", async () => {
  await resetTestDatabase();
  await seed();
  const [c] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Review Guest", "000", "MOCK"],
  );
  const [a] = await pool.execute(
    "INSERT INTO accounts (customer_id,email,password_hash,role) VALUES (?,?,?,?)",
    [
      c.insertId,
      `review-${Date.now()}@test.local`,
      await hashPassword("password12345"),
      "member",
    ],
  );
  try {
    const b = await withTransaction((x) =>
      createBookingHold(x, {
        customerId: c.insertId,
        accountId: a.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2027-07-01",
        checkOut: "2027-07-02",
        services: {},
      }),
    );
    await assert.rejects(
      withTransaction((x) =>
        createReview(x, {
          bookingId: b.id,
          accountId: a.insertId,
          rating: 5,
          content: "Nice",
        }),
      ),
      (e) => e.status === 403,
    );
    await pool.execute("UPDATE bookings SET status='checked_in' WHERE id=?", [
      b.id,
    ]);
    await withTransaction((x) =>
      createReview(x, {
        bookingId: b.id,
        accountId: a.insertId,
        rating: 5,
        content: "Nice",
      }),
    );
    await withTransaction((x) =>
      createReview(x, {
        bookingId: b.id,
        accountId: a.insertId,
        rating: 4,
        content: "Great",
      }),
    );
    const [[row]] = await pool.execute(
      "SELECT COUNT(*) AS amount FROM reviews WHERE booking_id=?",
      [b.id],
    );
    assert.equal(row.amount, 2);
  } finally {
    await pool.end();
  }
});
