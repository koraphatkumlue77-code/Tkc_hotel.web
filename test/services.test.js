import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { addServiceAfterCheckIn } from "../server/services.js";
import { resetTestDatabase } from "./reset.js";
import { migrate } from "../db/migrate.js";

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
        services: { sauna: true, breakfastDates: ["2027-12-01"] },
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
    const [links] = await pool.execute(
      "SELECT s.kind, COUNT(*) AS n, COUNT(DISTINCT l.booking_room_id) AS rooms FROM booking_services s LEFT JOIN booking_service_rooms l ON l.service_id=s.id WHERE s.booking_id=? GROUP BY s.kind ORDER BY s.kind",
      [b.id],
    );
    assert.deepEqual(
      links.map(({ kind, n, rooms }) => ({ kind, n, rooms })),
      [
        { kind: "breakfast", n: 2, rooms: 2 },
        { kind: "fitness", n: 2, rooms: 2 },
        { kind: "sauna", n: 2, rooms: 2 },
      ],
    );
    const [breakfast] = await pool.execute(
      "SELECT s.unit_price,br.type_id FROM booking_services s JOIN booking_service_rooms l ON l.service_id=s.id JOIN booking_rooms br ON br.id=l.booking_room_id WHERE s.booking_id=? AND s.kind='breakfast' ORDER BY s.unit_price",
      [b.id],
    );
    assert.deepEqual(
      breakfast.map(({ unit_price, type_id }) => ({ unit_price, type_id })),
      [
        { unit_price: 350, type_id: 1 },
        { unit_price: 500, type_id: 4 },
      ],
    );
    const other = await withTransaction((x) =>
      createBookingHold(x, {
        customerId: c.insertId,
        rooms: [{ typeId: 1, guests: 1 }],
        checkIn: "2027-12-05",
        checkOut: "2027-12-06",
        services: {},
      }),
    );
    const [[otherRoom]] = await pool.execute(
      "SELECT id FROM booking_rooms WHERE booking_id=?",
      [other.id],
    );
    const [[link]] = await pool.execute(
      "SELECT l.service_id FROM booking_service_rooms l JOIN booking_services s ON s.id=l.service_id WHERE s.booking_id=? AND s.kind='sauna' LIMIT 1",
      [b.id],
    );
    await assert.rejects(
      pool.execute(
        "INSERT INTO booking_service_rooms (service_id,booking_room_id) VALUES (?,?)",
        [link.service_id, otherRoom.id],
      ),
      (error) => error.sqlState === "45000",
    );
    await assert.rejects(
      pool.execute(
        "UPDATE booking_service_rooms SET booking_room_id=? WHERE service_id=?",
        [otherRoom.id, link.service_id],
      ),
      (error) => error.sqlState === "45000",
    );
    await assert.rejects(
      pool.execute("UPDATE booking_services SET booking_id=? WHERE id=?", [
        other.id,
        link.service_id,
      ]),
      (error) => error.sqlState === "45000",
    );
    const [[linkedRoom]] = await pool.execute(
      "SELECT booking_room_id FROM booking_service_rooms WHERE service_id=?",
      [link.service_id],
    );
    await assert.rejects(
      pool.execute("UPDATE booking_rooms SET booking_id=? WHERE id=?", [
        other.id,
        linkedRoom.booking_room_id,
      ]),
      (error) => error.sqlState === "45000",
    );
    await pool.execute(
      "DELETE FROM migrations WHERE name='006_service_room_normalization.sql'",
    );
    await migrate();
    const [[retained]] = await pool.execute(
      "SELECT booking_room_id FROM booking_service_rooms WHERE service_id=?",
      [link.service_id],
    );
    assert.equal(retained.booking_room_id, linkedRoom.booking_room_id);
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
