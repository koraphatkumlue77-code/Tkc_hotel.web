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

test("tour pricing sequences daily participant uses and cancellation releases totals", async () => {
  const fixture = await createFixture();
  try {
    const manager = await fixture.employee("tour.manager@example.test", "MANAGEMENT");
    const customer = await fixture.customer("tour.guest@example.test", "TOUR-GUEST");
    const date = addDays(bangkokDate(), 2);
    const booking = await fixture.booking(customer.id, date, addDays(date, 2));
    const firstRound = await fixture.createRound(manager.cookie, date, "18:00", 10);
    const secondRound = await fixture.createRound(manager.cookie, date, "19:00", 10);
    const first = await fixture.post(customer.cookie, `/api/bookings/${booking.id}/tours`, {
      tourRoundId: firstRound.id, participantCode: "P-1", participantName: "Guest One"
    });
    const second = await fixture.post(customer.cookie, `/api/bookings/${booking.id}/tours`, {
      tourRoundId: secondRound.id, participantCode: "P-1", participantName: "Guest One"
    });
    assert.equal(first.response.status, 201);
    assert.equal(first.body.data.usageSequenceForDay, 1);
    assert.equal(first.body.data.unitPrice, "50.00");
    assert.equal(second.response.status, 201);
    assert.equal(second.body.data.usageSequenceForDay, 2);
    assert.equal(second.body.data.unitPrice, "100.00");
    const cancelled = await fixture.post(customer.cookie,
      `/api/bookings/${booking.id}/tours/${second.body.data.id}/cancel`, {});
    assert.equal(cancelled.response.status, 200);
    const [[stored]] = await fixture.pool.execute(
      "SELECT CAST(service_subtotal_snapshot AS CHAR) AS services, CAST(total_snapshot AS CHAR) AS total FROM Booking WHERE booking_id = ?",
      [booking.id]
    );
    assert.deepEqual(stored, { services: "50.00", total: "1050.00" });
    const listResponse = await fetch(`${fixture.baseUrl}/api/tours/rounds?from=${date}&to=${date}`);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.data.find(({ id }) => id === secondRound.id).remainingSeats, 10);
  } finally { await fixture.close(); }
});

test("concurrent requests cannot take the same final tour seat", async () => {
  const fixture = await createFixture();
  try {
    const manager = await fixture.employee("tour.race.manager@example.test", "MANAGEMENT");
    const firstCustomer = await fixture.customer("tour.race.one@example.test", "TOUR-RACE-1");
    const secondCustomer = await fixture.customer("tour.race.two@example.test", "TOUR-RACE-2");
    const date = addDays(bangkokDate(), 3);
    const firstBooking = await fixture.booking(firstCustomer.id, date, addDays(date, 1));
    const secondBooking = await fixture.booking(secondCustomer.id, date, addDays(date, 1));
    const round = await fixture.createRound(manager.cookie, date, "18:00", 1);
    const results = await Promise.all([
      fixture.post(firstCustomer.cookie, `/api/bookings/${firstBooking.id}/tours`, { tourRoundId: round.id, participantCode: "ONE", participantName: "One" }),
      fixture.post(secondCustomer.cookie, `/api/bookings/${secondBooking.id}/tours`, { tourRoundId: round.id, participantCode: "TWO", participantName: "Two" })
    ]);
    assert.deepEqual(results.map(({ response }) => response.status).sort(), [201, 409]);
    assert.equal(results.find(({ response }) => response.status === 409).body.code, "TOUR_CAPACITY_FULL");
  } finally { await fixture.close(); }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment(); await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({ checkDatabase: async () => pool.query("SELECT 1"), pool,
    authConfig: { secret: "tour-integration-secret-at-least-32-characters", tokenTtlSeconds: 900, cookieName: "tkc_session", secureCookie: false } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let sequence = 0;
  const request = async (cookie, pathname, body, method = "POST") => {
    const response = await fetch(`${baseUrl}${pathname}`, { method,
      headers: { "content-type": "application/json", Origin: baseUrl, Cookie: cookie }, body: JSON.stringify(body) });
    return { response, body: await response.json() };
  };
  return { pool, baseUrl, post: request,
    async employee(email, role) {
      const password = "TourEmployee123!";
      await pool.execute("INSERT INTO Employee (department_name, role_name, name, email, password_hash, active) VALUES ('Hotel', ?, 'Tour Staff', ?, ?, TRUE)", [role, email, await bcrypt.hash(password, 4)]);
      const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", Origin: baseUrl }, body: JSON.stringify({ account_type: "employee", email, password }) });
      return { cookie: response.headers.get("set-cookie").split(";", 1)[0] };
    },
    async customer(email, identityNumber) {
      const response = await fetch(`${baseUrl}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", Origin: baseUrl },
        body: JSON.stringify({ full_name: "Tour Guest", email, phone: "0833333333", identity_type: "ID_CARD", identity_number: identityNumber, password: "TourGuest123!" }) });
      const body = await response.json();
      return { id: body.data.principal.id, cookie: response.headers.get("set-cookie").split(";", 1)[0] };
    },
    async booking(customerId, checkIn, checkOut) {
      sequence += 1;
      const [result] = await pool.execute(`INSERT INTO Booking
        (booking_code, customer_id, status, status_changed_at, channel, check_in_date, check_out_date, hold_expires_at,
         deposit_rate, room_subtotal_snapshot, service_subtotal_snapshot, discount_total_snapshot, total_snapshot)
        VALUES (?, ?, 'PENDING_PAYMENT', CURRENT_TIMESTAMP, 'ONLINE', ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE), 20, 1000, 0, 0, 1000)`,
      [`TOUR-${Date.now()}-${sequence}`, customerId, checkIn, checkOut]);
      await pool.execute("INSERT INTO BookingRoom (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount) VALUES (?, 1, 1, 1000, 1000)", [result.insertId]);
      return { id: Number(result.insertId) };
    },
    async createRound(cookie, tourDate, startTime, capacity) {
      const result = await request(cookie, "/api/staff/tours/rounds", { serviceId: 5, tourDate, startTime, capacity, status: "OPEN" });
      assert.equal(result.response.status, 201); return result.body.data;
    },
    async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); }
  };
}

function bangkokDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function addDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
