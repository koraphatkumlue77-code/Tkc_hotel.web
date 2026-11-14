import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { assignRoom, checkIn, checkOut } from "../server/stays.js";
import { resetTestDatabase } from "./reset.js";

test("assignment and arrival respect accounting, full payment and local time", async () => {
  await resetTestDatabase();
  await seed();
  const [c] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Stay Guest", "000", "MOCK"],
  );
  try {
    const b = await withTransaction((x) =>
      createBookingHold(x, {
        customerId: c.insertId,
        rooms: [{ typeId: 1, guests: 2 }],
        checkIn: "2027-09-01",
        checkOut: "2027-09-03",
        services: {},
      }),
    );
    const [[br]] = await pool.execute(
      "SELECT id FROM booking_rooms WHERE booking_id=?",
      [b.id],
    );
    const [[room]] = await pool.execute(
      "SELECT id FROM rooms WHERE type_id=1 AND status='ready' LIMIT 1",
    );
    await assert.rejects(
      withTransaction((x) =>
        assignRoom(x, { bookingRoomId: br.id, roomId: room.id, actorId: 1 }),
      ),
      (error) => error.status === 409,
    );
    await pool.execute("UPDATE bookings SET status='confirmed' WHERE id=?", [
      b.id,
    ]);
    await withTransaction((x) =>
      assignRoom(x, { bookingRoomId: br.id, roomId: room.id, actorId: 1 }),
    );
    await assert.rejects(
      withTransaction((x) =>
        checkIn(x, {
          bookingId: b.id,
          actorId: 1,
          now: new Date("2027-09-01T06:59:00Z"),
        }),
      ),
      (error) => error.status === 409,
    );
    await assert.rejects(
      withTransaction((x) =>
        checkIn(x, {
          bookingId: b.id,
          actorId: 1,
          now: new Date("2027-09-01T07:01:00Z"),
        }),
      ),
      (error) => error.status === 409,
    );
    await pool.execute(
      "INSERT INTO payments (booking_id,amount,method,status,auto_check) VALUES (?,?,'reception_demo','approved','test')",
      [b.id, b.total],
    );
    await withTransaction((x) =>
      checkIn(x, {
        bookingId: b.id,
        actorId: 1,
        now: new Date("2027-09-01T07:01:00Z"),
      }),
    );
    await withTransaction((x) =>
      checkOut(x, {
        bookingId: b.id,
        actorId: 1,
        now: new Date("2027-09-03T04:00:00Z"),
      }),
    );
    const [[task]] = await pool.execute(
      "SELECT COUNT(*) AS amount FROM cleaning_tasks WHERE booking_id=?",
      [b.id],
    );
    assert.equal(task.amount, 1);
  } finally {
    await pool.end();
  }
});
