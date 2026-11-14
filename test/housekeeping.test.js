import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import {
  startCleaning,
  finishCleaning,
  closeRoomForRepair,
} from "../server/housekeeping.js";
import { resetTestDatabase } from "./reset.js";

test("cleaning records its worker but cannot reopen a repair-closed room", async () => {
  await resetTestDatabase();
  await seed();
  const [c] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Clean Guest", "000", "MOCK"],
  );
  try {
    const b = await withTransaction((x) =>
      createBookingHold(x, {
        customerId: c.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2027-10-01",
        checkOut: "2027-10-02",
        services: {},
      }),
    );
    const [[room]] = await pool.query(
      "SELECT id FROM rooms WHERE type_id=1 AND status='ready' ORDER BY id DESC LIMIT 1",
    );
    const [task] = await pool.execute(
      "INSERT INTO cleaning_tasks (room_id,booking_id,status) VALUES (?,?,'pending')",
      [room.id, b.id],
    );
    await pool.execute("UPDATE rooms SET status='dirty' WHERE id=?", [room.id]);
    const [[hk]] = await pool.query(
      "SELECT id FROM accounts WHERE role='housekeeping' LIMIT 1",
    );
    const [[manager]] = await pool.query(
      "SELECT id FROM accounts WHERE role='management' LIMIT 1",
    );
    await withTransaction((x) =>
      startCleaning(x, { taskId: task.insertId, employeeId: hk.id }),
    );
    await withTransaction((x) =>
      closeRoomForRepair(x, {
        roomId: room.id,
        managerId: manager.id,
        from: "2027-10-01",
        to: "2027-10-03",
        reason: "test repair",
      }),
    );
    await withTransaction((x) =>
      finishCleaning(x, { taskId: task.insertId, employeeId: hk.id }),
    );
    const [[state]] = await pool.execute(
      "SELECT status FROM rooms WHERE id=?",
      [room.id],
    );
    assert.equal(state.status, "repair");
    const [[finished]] = await pool.execute(
      "SELECT employee_id AS employeeId,finished_at AS finishedAt FROM cleaning_tasks WHERE id=?",
      [task.insertId],
    );
    assert.equal(finished.employeeId, hk.id);
    assert.ok(finished.finishedAt);
  } finally {
    await pool.end();
  }
});
