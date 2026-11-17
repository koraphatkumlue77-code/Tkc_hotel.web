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
      serviceId: 3, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "07:00", quantity: 1
    });
    assert.equal(wrongOwner.response.status, 404);

    const added = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 3, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "07:00", quantity: 1
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

test("customer books per-person facility rounds with live hold, guest, schedule, and capacity rules", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.customer("service.rounds@example.test", "SERVICE-ROUNDS");
    const booking = await fixture.booking(owner.customerId, "PENDING_PAYMENT", { guestCount: 3, holdMinutes: 15 });
    const rounds = await fixture.get(owner.cookie,
      `/api/services/3/rounds?date=${booking.checkIn}&bookingRoomId=${booking.bookingRoomId}`);
    assert.equal(rounds.response.status, 200);
    assert.deepEqual(rounds.body.data[0], {
      startTime: "07:00:00", capacity: 40, reserved: 0, remaining: 40
    });

    const added = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 3, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "07:00", quantity: 2
    });
    assert.equal(added.response.status, 201);
    assert.equal(added.body.data.quantity, 2);
    assert.equal(added.body.data.startTime, "07:00:00");
    assert.equal(added.body.data.amount, "1000.00");
    const detail = await fixture.get(owner.cookie, `/api/bookings/${booking.id}`);
    assert.deepEqual(
      detail.body.data.services.map(({ startTime, quantity, amount }) => ({ startTime, quantity, amount })),
      [{ startTime: "07:00:00", quantity: 2, amount: "1000.00" }]
    );

    const repeatRound = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 3, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "09:00", quantity: 2
    });
    assert.equal(repeatRound.response.status, 201);
    assert.equal(repeatRound.body.data.amount, "0.00");
    assert.equal(repeatRound.body.data.passQuantity, 2);

    const upgradedPass = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 3, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "12:00", quantity: 3
    });
    assert.equal(upgradedPass.response.status, 201);
    assert.equal(upgradedPass.body.data.amount, "500.00");
    assert.equal(upgradedPass.body.data.passQuantity, 3);
    const [[passTotals]] = await fixture.pool.execute(
      "SELECT CAST(service_subtotal_snapshot AS CHAR) AS services, CAST(total_snapshot AS CHAR) AS total FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.deepEqual(passTotals, { services: "1500.00", total: "2500.00" });

    const reception = await fixture.employee("service.rounds.reception@example.test", "RECEPTION");
    const staffDetail = await fixture.get(reception.cookie, `/api/staff/bookings/${booking.id}`);
    assert.equal(staffDetail.response.status, 200);
    assert.equal(staffDetail.body.data.serviceSubtotal, "1500.00");
    assert.deepEqual(
      staffDetail.body.data.services.map(({ name, startTime, quantity, amount }) => ({ name, startTime, quantity, amount })),
      [
        { name: "ฟิตเนส", startTime: "07:00:00", quantity: 2, amount: "1500.00" },
        { name: "ฟิตเนส", startTime: "09:00:00", quantity: 2, amount: "0.00" },
        { name: "ฟิตเนส", startTime: "12:00:00", quantity: 3, amount: "0.00" }
      ]
    );

    const tooMany = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 4, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "07:00", quantity: 4
    });
    assert.equal(tooMany.response.status, 400);
    assert.equal(tooMany.body.code, "SERVICE_PARTY_TOO_LARGE");

    const invalidRound = await fixture.post(owner.cookie, `/api/bookings/${booking.id}/services`, {
      serviceId: 4, bookingRoomId: booking.bookingRoomId, usageDate: booking.checkIn,
      startTime: "08:00", quantity: 1
    });
    assert.equal(invalidRound.response.status, 400);
    assert.equal(invalidRound.body.code, "SERVICE_ROUND_INVALID");

    const expired = await fixture.booking(owner.customerId, "PENDING_PAYMENT", { guestCount: 2, holdMinutes: -1 });
    const expiredAdd = await fixture.post(owner.cookie, `/api/bookings/${expired.id}/services`, {
      serviceId: 3, bookingRoomId: expired.bookingRoomId, usageDate: expired.checkIn,
      startTime: "09:00", quantity: 1
    });
    assert.equal(expiredAdd.response.status, 409);
    assert.equal(expiredAdd.body.code, "BOOKING_SERVICE_STATE_INVALID");
  } finally {
    await fixture.close();
  }
});

test("concurrent facility requests cannot exceed the final shared seat", async () => {
  const fixture = await createFixture();
  try {
    const seedCustomer = await fixture.customer("service.capacity.seed@example.test", "SERVICE-CAP-SEED");
    const first = await fixture.customer("service.capacity.one@example.test", "SERVICE-CAP-ONE");
    const second = await fixture.customer("service.capacity.two@example.test", "SERVICE-CAP-TWO");
    const seedBooking = await fixture.booking(seedCustomer.customerId, "CONFIRMED");
    const firstBooking = await fixture.booking(first.customerId, "CONFIRMED");
    const secondBooking = await fixture.booking(second.customerId, "CONFIRMED");
    const [bookingService] = await fixture.pool.execute(
      "INSERT INTO BookingService (booking_id, service_id, status) VALUES (?, 3, 'SELECTED')",
      [seedBooking.id]
    );
    await fixture.pool.execute(`
      INSERT INTO ServiceUsage
        (booking_service_id, booking_room_id, usage_date, start_time, unit_price_snapshot, quantity, status)
      VALUES (?, ?, ?, '12:00:00', 500, 39, 'ACTIVE')
    `, [bookingService.insertId, seedBooking.bookingRoomId, seedBooking.checkIn]);

    const requests = await Promise.all([
      fixture.post(first.cookie, `/api/bookings/${firstBooking.id}/services`, {
        serviceId: 3, bookingRoomId: firstBooking.bookingRoomId, usageDate: firstBooking.checkIn,
        startTime: "12:00", quantity: 1
      }),
      fixture.post(second.cookie, `/api/bookings/${secondBooking.id}/services`, {
        serviceId: 3, bookingRoomId: secondBooking.bookingRoomId, usageDate: secondBooking.checkIn,
        startTime: "12:00", quantity: 1
      })
    ]);
    assert.deepEqual(requests.map(({ response }) => response.status).sort(), [201, 409]);
  } finally {
    await fixture.close();
  }
});

test("Reception adds a post-Check-in service for Check-out settlement idempotently", async () => {
  const fixture = await createFixture();
  try {
    const owner = await fixture.customer("service.stay@example.test", "SERVICE-STAY");
    const reception = await fixture.employee("service.reception@example.test", "RECEPTION");
    const booking = await fixture.booking(owner.customerId, "CHECKED_IN");
    const input = {
      serviceId: 4,
      bookingRoomId: booking.bookingRoomId,
      quantity: 1,
      startTime: "18:30",
      method: "CASH",
      idempotencyKey: "SERVICE-STAY-1"
    };
    const first = await fixture.post(reception.cookie, `/api/staff/bookings/${booking.id}/services`, input);
    assert.equal(first.response.status, 201);
    assert.equal(first.body.data.amount, "300.00");
    assert.equal(first.body.data.payment, undefined);
    const replay = await fixture.post(reception.cookie, `/api/staff/bookings/${booking.id}/services`, input);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.meta.replayed, true);
    assert.equal(replay.body.data.id, first.body.data.id);
    const [[counts]] = await fixture.pool.execute(`
      SELECT
        (SELECT COUNT(*) FROM BookingService WHERE booking_id = ?) AS services,
        (SELECT COUNT(*) FROM Payment WHERE booking_id = ? AND transaction_type = 'SERVICE_PAYMENT') AS payments
    `, [booking.id, booking.id]);
    const [[amounts]] = await fixture.pool.execute(
      "SELECT CAST(service_subtotal_snapshot AS CHAR) AS services, CAST(total_snapshot AS CHAR) AS total FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.deepEqual({ services: Number(counts.services), payments: Number(counts.payments) }, { services: 1, payments: 0 });
    assert.deepEqual(amounts, { services: "300.00", total: "1300.00" });
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
    async booking(customerId, status, { guestCount = 1, holdMinutes = 15 } = {}) {
      const today = bangkokDate();
      const [booking] = await pool.execute(`
        INSERT INTO Booking
          (booking_code, customer_id, status, status_changed_at, channel, check_in_date, check_out_date,
           hold_expires_at, deposit_rate, room_subtotal_snapshot, service_subtotal_snapshot,
           discount_total_snapshot, total_snapshot)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'ONLINE', ?, ?,
                DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), 100, 1000, 0, 0, 1000)
      `, [`SVC-${Date.now()}-${customerId}`, customerId, status, today, addDays(today, 2), holdMinutes]);
      const [bookingRoom] = await pool.execute(`
        INSERT INTO BookingRoom (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
        VALUES (?, 4, ?, 1000, 1000)
      `, [booking.insertId, guestCount]);
      return { id: Number(booking.insertId), bookingRoomId: Number(bookingRoom.insertId), checkIn: today };
    },
    async post(cookie, pathname, body) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: baseUrl, Cookie: cookie },
        body: JSON.stringify(body)
      });
      return { response, body: await response.json() };
    },
    async get(cookie, pathname) {
      const response = await fetch(`${baseUrl}${pathname}`, { headers: { Cookie: cookie } });
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
