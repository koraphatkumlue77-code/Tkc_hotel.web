import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { resetTestDatabase } from "./reset.js";

test("ownership triggers see links committed after an old transaction snapshot", async () => {
  await resetTestDatabase();
  await seed();
  const [customer] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES ('Race guest','000','RACE')",
  );
  let first;
  let second;
  try {
    first = await withTransaction((c) =>
      createBookingHold(c, {
        customerId: customer.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2028-06-01",
        checkOut: "2028-06-02",
        services: {},
      }),
    );
    second = await withTransaction((c) =>
      createBookingHold(c, {
        customerId: customer.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2028-06-03",
        checkOut: "2028-06-04",
        services: {},
      }),
    );
    const [[room]] = await pool.execute(
      "SELECT id FROM booking_rooms WHERE booking_id=?",
      [first.id],
    );
    const [service] = await pool.execute(
      "INSERT INTO booking_services (booking_id,kind,quantity,unit_price,total) VALUES (?,'fitness',1,500,500)",
      [first.id],
    );
    const transaction = await pool.getConnection();
    try {
      await transaction.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
      );
      await transaction.beginTransaction();
      const [[snapshot]] = await transaction.query(
        "SELECT COUNT(*) AS n FROM booking_service_rooms",
      );
      assert.equal(snapshot.n, 0);
      await pool.execute(
        "INSERT INTO booking_service_rooms (service_id,booking_room_id) VALUES (?,?)",
        [service.insertId, room.id],
      );
      await assert.rejects(
        transaction.execute(
          "UPDATE booking_services SET booking_id=? WHERE id=?",
          [second.id, service.insertId],
        ),
        (error) => error.sqlState === "45000",
      );
      await transaction.rollback();
    } finally {
      transaction.release();
    }
    const [anotherRoom] = await pool.execute(
      "INSERT INTO booking_rooms (booking_id,type_id,guests,nightly_price) VALUES (?,1,1,1000)",
      [first.id],
    );
    const [anotherService] = await pool.execute(
      "INSERT INTO booking_services (booking_id,kind,quantity,unit_price,total) VALUES (?,'sauna',1,300,300)",
      [first.id],
    );
    const roomTransaction = await pool.getConnection();
    try {
      await roomTransaction.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
      );
      await roomTransaction.beginTransaction();
      await roomTransaction.query("SELECT COUNT(*) FROM booking_service_rooms");
      await pool.execute(
        "INSERT INTO booking_service_rooms (service_id,booking_room_id) VALUES (?,?)",
        [anotherService.insertId, anotherRoom.insertId],
      );
      await assert.rejects(
        roomTransaction.execute(
          "UPDATE booking_rooms SET booking_id=? WHERE id=?",
          [second.id, anotherRoom.insertId],
        ),
        (error) => error.sqlState === "45000",
      );
      await roomTransaction.rollback();
    } finally {
      roomTransaction.release();
    }
  } finally {
    await pool.end();
  }
});
