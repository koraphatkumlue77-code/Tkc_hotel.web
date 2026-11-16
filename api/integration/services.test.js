import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { config as loadEnvironment } from "dotenv";
import mysql from "mysql2/promise";

import { createApp } from "../app.js";
import { configFromEnvironment, resetTestDatabase } from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("public service catalog comes from MySQL and excludes tours", async () => {
  const fixture = await createFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/services`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.data.some(({ serviceKind }) => serviceKind === "FITNESS"));
    assert.ok(body.data.some(({ serviceKind }) => serviceKind === "POOL" && Number.parseFloat(body.data.find(({ serviceKind: kind }) => kind === "POOL").defaultRate) === 0));
    assert.ok(body.data.every(({ serviceKind }) => !["TOUR", "ATTRACTION"].includes(serviceKind)));
  } finally {
    await fixture.close();
  }
});

test("customer adds and cancels a server-priced booking service", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.customer("service.owner@example.test", "SERVICE-OWNER");
    const stranger = await fixture.customer("service.other@example.test", "SERVICE-OTHER");
    const booking = await fixture.booking(owner.customerId, "CONFIRMED");

    const wrongOwner = await fixture.post(stranger.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 3, bookingRoomId: booking.bookingRoomId, quantity: 1
    });
    assert.equal(wrongOwner.response.status, 404);

    const added = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 3, bookingRoomId: booking.bookingRoomId, quantity: 1
    });
    assert.equal(added.response.status, 201);
    assert.equal(added.body.data.amount, "500.00");
    assert.equal(added.body.data.status, "SELECTED");
    const [[afterAdd]] = await fixture.pool.execute(
      "SELECT CAST(service_subtotal_snapshot AS CHAR) AS services, CAST(total_snapshot AS CHAR) AS total FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.deepEqual(afterAdd, { services: "500.00", total: "1500.00" });

    const cancelled = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services/${added.body.data.id}/cancel`, {});
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.data.status, "CANCELLED");
    const [[afterCancel]] = await fixture.pool.execute(
      "SELECT CAST(service_subtotal_snapshot AS CHAR) AS services, CAST(total_snapshot AS CHAR) AS total FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.deepEqual(afterCancel, { services: "0.00", total: "1000.00" });
  } finally {
    await fixture.close();
  }
});

test("Reception records a fully paid post-Check-in service atomically and idempotently", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.customer("service.stay@example.test", "SERVICE-STAY");
    const reception = await fixture.employee("service.reception@example.test", "RECEPTION");
    const booking = await fixture.booking(owner.customerId, "CHECKED_IN");
    const input = {
      serviceId: 4,
      bookingRoomId: booking.bookingRoomId,
      quantity: 1,
      method: "CASH",
      idempotencyKey: "SERVICE-STAY-1"
    };
    const first = await fixture.post(reception.cookie, `/api/staff/bookings/${booking.id}/services`, input);
    assert.equal(first.response.status, 201);
    assert.equal(first.body.data.amount, "300.00");
    assert.equal(first.body.data.payment.status, "VERIFIED");
    const replay = await fixture.post(reception.cookie, `/api/staff/bookings/${booking.id}/services`, input);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.meta.replayed, true);
    assert.equal(replay.body.data.id, first.body.data.id);
    const [[counts]] = await fixture.pool.execute(`
      SELECT
        (SELECT COUNT(*) FROM BookingService WHERE booking_id = ?) AS services,
        (SELECT COUNT(*) FROM Payment WHERE booking_id = ? AND transaction_type = 'SERVICE_PAYMENT') AS payments
    `, [booking.id, booking.id]);
    assert.deepEqual({ services: Number(counts.services), payments: Number(counts.payments) }, { services: 1, payments: 1 });
  } finally {
    await fixture.close();
  }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"), pool,
    authConfig: {
      secret: "service-integration-secret-at-least-32-characters",
      tokenTtlSeconds: 900, cookieName: "tkc_session", secureCookie: false
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    pool, baseUrl,
    async customer(email, identityNumber) {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST", headers: { "content-type": "application/json", Origin: baseUrl },
        body: JSON.stringify({
          full_name: "Service Guest", email, phone: "0822222222",
          identity_type: "ID_CARD", identity_number: identityNumber, password: "ServicePass123!"
        })
      });
      const body = await response.json();
      assert.equal(response.status, 201);
      return { customerId: body.data.principal.id, cookie: response.headers.get("set-cookie").split(";", 1)[0] };
    },
    async employee(email, role) {
      const password = "ServiceEmployee123!";
      const [result] = await pool.execute(`
        INSERT INTO Employee (department_name, role_name, name, email, password_hash, active)
        VALUES ('Hotel', ?, 'Service Staff', ?, ?, TRUE)
      `, [role, email, await bcrypt.hash(password, 4)]);
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST", headers: { "content-type": "application/json", Origin: baseUrl },
        body: JSON.stringify({ account_type: "employee", email, password })
      });
      assert.equal(response.status, 200);
      return { employeeId: Number(result.insertId), cookie: response.headers.get("set-cookie").split(";", 1)[0] };
    },
    async booking(customerId, status) {
      const today = bangkokDate();
      const [booking] = await pool.execute(`
        INSERT INTO Booking
          (booking_code, customer_id, status, status_changed_at, channel, check_in_date, check_out_date,
           deposit_rate, room_subtotal_snapshot, service_subtotal_snapshot, discount_total_snapshot, total_snapshot)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'ONLINE', ?, ?, 100, 1000, 0, 0, 1000)
      `, [`SVC-${Date.now()}-${customerId}`, customerId, status, today, addDays(today, 2)]);
      const [bookingRoom] = await pool.execute(`
        INSERT INTO BookingRoom (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
        VALUES (?, 1, 1, 1000, 1000)
      `, [booking.insertId]);
      return { id: Number(booking.insertId), bookingRoomId: Number(bookingRoom.insertId) };
    },
    async post(cookie, pathname, body) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: baseUrl, Cookie: cookie },
        body: JSON.stringify(body)
      });
      return { response, body: await response.json() };
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await pool.end();
    }
  };
}

function bangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
