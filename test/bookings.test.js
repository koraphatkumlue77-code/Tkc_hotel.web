import test from "node:test";
import assert from "node:assert/strict";
import { pool, withTransaction } from "../server/db.js";
import { migrate } from "../db/migrate.js";
import { seed } from "../db/seed.js";
import { createBookingHold } from "../server/bookings.js";
import { resetTestDatabase } from "./reset.js";

test("one remaining room can only be held by one concurrent booking", async () => {
  await resetTestDatabase();
  await migrate();
  await seed();
  const suffix = Date.now();
  await pool.execute(
    "INSERT INTO room_types (id,name,capacity,nightly_price,breakfast_price) SELECT MAX(id)+1,?,2,1000,350 FROM room_types",
    [`Test ${suffix}`],
  );
  const [[typeRow]] = await pool.execute(
    "SELECT id FROM room_types WHERE name=?",
    [`Test ${suffix}`],
  );
  await pool.execute("INSERT INTO rooms (type_id,code) VALUES (?,?)", [
    typeRow.id,
    `Tst${String(typeRow.id).padStart(3, "0")}`,
  ]);
  const [customer] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Test Guest", "000", "TEST"],
  );
  const input = {
    customerId: customer.insertId,
    rooms: [{ typeId: typeRow.id, guests: 2 }],
    checkIn: "2027-04-01",
    checkOut: "2027-04-03",
    services: {},
  };
  try {
    const results = await Promise.allSettled([
      withTransaction((c) => createBookingHold(c, input)),
      withTransaction((c) => createBookingHold(c, input)),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(results.filter((x) => x.status === "rejected").length, 1);
  } finally {
    await pool.end();
  }
});
