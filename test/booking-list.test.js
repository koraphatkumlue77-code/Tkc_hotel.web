import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { pool, withTransaction } from "../server/db.js";
import { createBookingHold } from "../server/bookings.js";
import { seed } from "../db/seed.js";
import { resetTestDatabase } from "./reset.js";

test("member booking lists include the persisted hold deadline for expiry filters", async () => {
  await resetTestDatabase();
  await seed();
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const registration = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "list@example.test",
        password: "Passphrase-123!",
        fullName: "Booking list test",
        phone: "0800000000",
        identityReference: "TEST-LIST",
      }),
    });
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get("set-cookie").split(";")[0];
    const checkIn = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const checkOut = new Date(Date.now() + 9 * 86400000)
      .toISOString()
      .slice(0, 10);
    const response = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        checkIn,
        checkOut,
        rooms: [{ typeId: 1, guests: 2 }],
        services: {},
        source: "walk_in",
      }),
    });
    assert.equal(response.status, 201);
    const held = await response.json();
    const [[stored]] = await pool.execute(
      "SELECT source FROM bookings WHERE id=?",
      [held.id],
    );
    assert.equal(stored.source, "online");
    const forgedPastBooking = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        checkIn: "2020-01-01",
        checkOut: "2020-01-02",
        rooms: [{ typeId: 1, guests: 1 }],
        services: {},
        now: "2000-01-01",
      }),
    });
    assert.equal(forgedPastBooking.status, 400);
    const rows = await fetch(`${base}/api/bookings/mine`, {
      headers: { cookie },
    }).then((response) => response.json());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, held.id);
    assert.equal(rows[0].status, "held");
    assert.ok(
      Math.abs(new Date(rows[0].holdUntil) - new Date(held.holdUntil)) < 1000,
    );
    const [otherCustomer] = await pool.execute(
      "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
      ["Other guest", "000", "OTHER"],
    );
    const other = await withTransaction((connection) =>
      createBookingHold(connection, {
        customerId: otherCustomer.insertId,
        checkIn,
        checkOut,
        rooms: [{ typeId: 1, guests: 1 }],
        services: {},
      }),
    );
    const payment = await fetch(`${base}/api/bookings/${held.id}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        bookingId: other.id,
        amount: held.depositDue,
        method: "online_demo",
      }),
    });
    assert.equal(payment.status, 201);
    const [payments] = await pool.execute(
      "SELECT booking_id FROM payments ORDER BY id",
    );
    assert.deepEqual(
      payments.map((row) => row.booking_id),
      [held.id],
    );
    const second = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        checkIn,
        checkOut,
        rooms: [{ typeId: 1, guests: 1 }],
        services: {},
      }),
    }).then((response) => response.json());
    await pool.execute(
      "UPDATE bookings SET hold_until=DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id=?",
      [second.id],
    );
    const forgedPayment = await fetch(
      `${base}/api/bookings/${second.id}/payments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          amount: second.depositDue,
          method: "online_demo",
          now: "2000-01-01",
        }),
      },
    );
    assert.equal(forgedPayment.status, 409);
    const managerLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "management@tkc.local",
        password: process.env.DEMO_STAFF_PASSWORD || "TkcDemo2026!",
      }),
    });
    assert.equal(managerLogin.status, 200);
    const managerCookie = managerLogin.headers.get("set-cookie").split(";")[0];
    const [[manager]] = await pool.execute(
      "SELECT id FROM accounts WHERE role='management' LIMIT 1",
    );
    const [roomRows] = await pool.query(
      "SELECT id FROM rooms WHERE type_id=1 ORDER BY id LIMIT 2",
    );
    const closure = await fetch(
      `${base}/api/rooms/${roomRows[0].id}/closures`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: managerCookie },
        body: JSON.stringify({
          roomId: roomRows[1].id,
          managerId: 999999999,
          from: checkIn,
          to: checkOut,
          reason: "API security test",
        }),
      },
    );
    assert.equal(closure.status, 201);
    const [[closed]] = await pool.execute(
      "SELECT room_id,closed_by FROM repair_closures ORDER BY id DESC LIMIT 1",
    );
    assert.equal(closed.room_id, roomRows[0].id);
    assert.equal(closed.closed_by, manager.id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
