import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

import { createApp } from "../app.js";
import { configFromEnvironment, resetTestDatabase } from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("customer booking snapshots prices, services, hold, and audit in MySQL", async () => {
  const fixture = await createFixture();
  try {
    const cookie = await fixture.register("booking.one@example.test", "BOOK-ONE");
    const result = await fixture.postBooking(cookie, {
      checkIn: "2037-03-10",
      checkOut: "2037-03-12",
      rooms: [{ roomTypeId: 1, guestCount: 2 }],
      breakfastDates: ["2037-03-11", "2037-03-12"],
      promotionCodes: [],
      paymentChoice: "deposit"
    });

    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.status, "PENDING_PAYMENT");
    assert.equal(result.body.data.channel, "ONLINE");
    assert.equal(result.body.data.nights, 2);
    assert.equal(result.body.data.roomSubtotal, "2000.00");
    assert.equal(result.body.data.serviceSubtotal, "700.00");
    assert.equal(result.body.data.discountTotal, "0.00");
    assert.equal(result.body.data.total, "2700.00");
    assert.equal(result.body.data.depositRate, "20.00");
    assert.equal(result.body.data.paymentDue, "540.00");
    assert.match(result.body.data.bookingCode, /^TKC-[A-Z0-9-]+$/);

    const [bookings] = await fixture.pool.execute(
      `SELECT status, channel, TIMESTAMPDIFF(MINUTE, CURRENT_TIMESTAMP, hold_expires_at) AS holdMinutes,
              CAST(total_snapshot AS CHAR) AS total
       FROM Booking WHERE booking_id = ?`,
      [result.body.data.id]
    );
    assert.equal(bookings[0].status, "PENDING_PAYMENT");
    assert.equal(bookings[0].channel, "ONLINE");
    assert.ok(Number(bookings[0].holdMinutes) >= 14 && Number(bookings[0].holdMinutes) <= 15);
    assert.equal(bookings[0].total, "2700.00");

    const [rooms] = await fixture.pool.execute(
      `SELECT room_type_id, guest_count, CAST(nightly_rate_snapshot AS CHAR) AS nightlyRate,
              CAST(net_amount AS CHAR) AS netAmount
       FROM BookingRoom WHERE booking_id = ?`,
      [result.body.data.id]
    );
    assert.deepEqual(rooms, [{ room_type_id: 1, guest_count: 2, nightlyRate: "1000.00", netAmount: "2000.00" }]);

    const [services] = await fixture.pool.execute(
      `SELECT bs.service_id, su.usage_date, CAST(su.unit_price_snapshot AS CHAR) AS unitPrice
       FROM BookingService bs JOIN ServiceUsage su ON su.booking_service_id = bs.booking_service_id
       WHERE bs.booking_id = ? ORDER BY su.usage_date`,
      [result.body.data.id]
    );
    assert.equal(services.length, 2);
    assert.ok(services.every(({ service_id, unitPrice }) => service_id === 1 && unitPrice === "350.00"));

    const [audits] = await fixture.pool.execute(
      "SELECT actor_type, actor_customer_id, action FROM AuditLog WHERE entity_type = 'Booking' AND entity_id = ?",
      [result.body.data.id]
    );
    assert.deepEqual(audits, [{ actor_type: "CUSTOMER", actor_customer_id: 1, action: "BOOKING_CREATED" }]);
  } finally {
    await fixture.close();
  }
});

test("booking rejects capacity and overlapping inventory but expired holds release it", async () => {
  const fixture = await createFixture();
  try {
    const cookie = await fixture.register("booking.two@example.test", "BOOK-TWO");
    const tooManyGuests = await fixture.postBooking(cookie, bookingBody({ guestCount: 3 }));
    assert.equal(tooManyGuests.response.status, 400);
    assert.equal(tooManyGuests.body.code, "ROOM_CAPACITY_EXCEEDED");

    await fixture.pool.execute(
      "INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate) VALUES ('Only One', 2, 900, 100)"
    );
    const [[{ roomTypeId }]] = await fixture.pool.query("SELECT LAST_INSERT_ID() AS roomTypeId");
    await fixture.pool.execute(
      "INSERT INTO Room (room_type_id, room_code, current_status) VALUES (?, 'ONLY001', 'AVAILABLE')",
      [roomTypeId]
    );

    const first = await fixture.postBooking(cookie, bookingBody({ roomTypeId }));
    assert.equal(first.response.status, 201);
    const blocked = await fixture.postBooking(cookie, bookingBody({ roomTypeId }));
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.body.code, "ROOM_INVENTORY_UNAVAILABLE");

    await fixture.pool.execute(
      "UPDATE Booking SET hold_expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE booking_id = ?",
      [first.body.data.id]
    );
    const released = await fixture.postBooking(cookie, bookingBody({ roomTypeId }));
    assert.equal(released.response.status, 201);

    await fixture.pool.execute(
      "INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate) VALUES ('Closed One', 2, 900, 100)"
    );
    const [[{ roomTypeId: closedTypeId }]] = await fixture.pool.query("SELECT LAST_INSERT_ID() AS roomTypeId");
    const [closedRoom] = await fixture.pool.execute(
      "INSERT INTO Room (room_type_id, room_code, current_status) VALUES (?, 'CLOSED001', 'OUT_OF_SERVICE')",
      [closedTypeId]
    );
    const [closeEvent] = await fixture.pool.execute(`
      INSERT INTO RoomEvent (room_id, event_type, status, effective_from, effective_to)
      VALUES (?, 'ROOM_CLOSED', 'ACTIVE', '2037-04-01', '2037-04-20')
    `, [closedRoom.insertId]);
    await fixture.pool.execute(`
      INSERT INTO RoomEvent
        (room_id, event_type, status, related_event_id, effective_from)
      VALUES (?, 'ROOM_REOPENED', 'SCHEDULED', ?, '2037-04-20')
    `, [closedRoom.insertId, closeEvent.insertId]);
    const closed = await fixture.postBooking(cookie, bookingBody({ roomTypeId: closedTypeId }));
    assert.equal(closed.response.status, 409);
    assert.equal(closed.body.code, "ROOM_INVENTORY_UNAVAILABLE");
  } finally {
    await fixture.close();
  }
});

test("concurrent requests cannot both reserve the final room", async () => {
  const fixture = await createFixture();
  try {
    const firstCookie = await fixture.register("booking.a@example.test", "BOOK-A");
    const secondCookie = await fixture.register("booking.b@example.test", "BOOK-B");
    await fixture.pool.execute(
      "INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate) VALUES ('Race One', 2, 800, 100)"
    );
    const [[{ roomTypeId }]] = await fixture.pool.query("SELECT LAST_INSERT_ID() AS roomTypeId");
    await fixture.pool.execute(
      "INSERT INTO Room (room_type_id, room_code, current_status) VALUES (?, 'RACE001', 'AVAILABLE')",
      [roomTypeId]
    );

    const results = await Promise.all([
      fixture.postBooking(firstCookie, bookingBody({ roomTypeId })),
      fixture.postBooking(secondCookie, bookingBody({ roomTypeId }))
    ]);
    assert.deepEqual(results.map(({ response }) => response.status).sort(), [201, 409]);
  } finally {
    await fixture.close();
  }
});

test("promotions stack by priority, persist snapshots, and reject unavailable codes", async () => {
  const fixture = await createFixture();
  try {
    const cookie = await fixture.register("booking.promo@example.test", "BOOK-PROMO");
    await fixture.pool.query(`
      INSERT INTO Promotion
        (code, name, discount_percent, priority, valid_from, valid_until, active)
      VALUES
        ('SAVE10', 'Save ten', 10.00, 20, '2020-01-01', '2037-12-31', TRUE),
        ('VIP50', 'VIP half', 50.00, 10, '2020-01-01', '2037-12-31', TRUE),
        ('EXPIRED', 'Expired', 25.00, 1, '2020-01-01', '2021-01-01', TRUE),
        ('ALLFREE', 'All free', 100.00, 1, NULL, NULL, TRUE)
    `);

    const promoted = await fixture.postBooking(cookie, {
      ...bookingBody(),
      promotionCodes: ["SAVE10", "VIP50"]
    });
    assert.equal(promoted.response.status, 201);
    assert.equal(promoted.body.data.roomSubtotal, "1000.00");
    assert.equal(promoted.body.data.discountTotal, "550.00");
    assert.equal(promoted.body.data.total, "450.00");
    assert.equal(promoted.body.data.paymentDue, "90.00");
    assert.deepEqual(
      promoted.body.data.promotions.map(({ code, sequence, discountAmount }) => ({ code, sequence, discountAmount })),
      [
        { code: "VIP50", sequence: 1, discountAmount: "500.00" },
        { code: "SAVE10", sequence: 2, discountAmount: "50.00" }
      ]
    );

    const [snapshots] = await fixture.pool.execute(`
      SELECT bp.sequence_no AS sequenceNo, p.code,
             CAST(bp.base_amount_before AS CHAR) AS baseBefore,
             CAST(bp.discount_amount AS CHAR) AS discountAmount,
             CAST(bp.base_amount_after AS CHAR) AS baseAfter
      FROM BookingPromotion bp JOIN Promotion p ON p.promotion_id = bp.promotion_id
      WHERE bp.booking_id = ? ORDER BY bp.sequence_no
    `, [promoted.body.data.id]);
    assert.deepEqual(snapshots, [
      { sequenceNo: 1, code: "VIP50", baseBefore: "1000.00", discountAmount: "500.00", baseAfter: "500.00" },
      { sequenceNo: 2, code: "SAVE10", baseBefore: "500.00", discountAmount: "50.00", baseAfter: "450.00" }
    ]);

    const free = await fixture.postBooking(cookie, {
      ...bookingBody({ roomTypeId: 2 }),
      promotionCodes: ["ALLFREE", "SAVE10"]
    });
    assert.equal(free.response.status, 201);
    assert.equal(free.body.data.total, "0.00");
    assert.equal(free.body.data.status, "CONFIRMED");
    assert.equal(free.body.data.holdExpiresAt, null);
    assert.equal(free.body.data.promotions[1].discountAmount, "0.00");

    for (const promotionCodes of [["UNKNOWN"], ["EXPIRED"]]) {
      const rejected = await fixture.postBooking(cookie, { ...bookingBody(), promotionCodes });
      assert.equal(rejected.response.status, 400);
      assert.equal(rejected.body.code, "PROMOTION_INVALID");
    }
  } finally {
    await fixture.close();
  }
});

test("customer history is paginated, owner-scoped, and represents expired holds", async () => {
  const fixture = await createFixture();
  try {
    const ownerCookie = await fixture.register("booking.owner@example.test", "BOOK-OWNER");
    const strangerCookie = await fixture.register("booking.stranger@example.test", "BOOK-STRANGER");
    const created = await fixture.postBooking(ownerCookie, bookingBody());
    assert.equal(created.response.status, 201);

    const mineResponse = await fetch(`${fixture.baseUrl}/api/bookings/mine?page=1&limit=10`, {
      headers: { Cookie: ownerCookie }
    });
    const mine = await mineResponse.json();
    assert.equal(mineResponse.status, 200);
    assert.equal(mine.data.length, 1);
    assert.equal(mine.data[0].id, created.body.data.id);
    assert.equal(mine.data[0].checkIn, "2037-04-10");
    assert.equal(mine.data[0].checkOut, "2037-04-11");
    assert.deepEqual(mine.meta, { page: 1, limit: 10, total: 1 });

    const detailResponse = await fetch(`${fixture.baseUrl}/api/bookings/${created.body.data.id}`, {
      headers: { Cookie: ownerCookie }
    });
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.data.checkIn, "2037-04-10");
    assert.equal(detail.data.rooms.length, 1);
    assert.deepEqual(detail.data.payment, { paid: "0.00", total: "1000.00", outstanding: "1000.00" });
    assert.ok(detail.data.timeline.some(({ action }) => action === "BOOKING_CREATED"));
    assert.ok(!JSON.stringify(detail).includes("actor_customer_id"));

    const strangerResponse = await fetch(`${fixture.baseUrl}/api/bookings/${created.body.data.id}`, {
      headers: { Cookie: strangerCookie }
    });
    assert.equal(strangerResponse.status, 404);

    await fixture.pool.execute(
      "UPDATE Booking SET hold_expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE booking_id = ?",
      [created.body.data.id]
    );
    const expiredResponse = await fetch(`${fixture.baseUrl}/api/bookings/mine`, {
      headers: { Cookie: ownerCookie }
    });
    const expired = await expiredResponse.json();
    assert.equal(expired.data[0].status, "PENDING_PAYMENT");
    assert.equal(expired.data[0].effectiveStatus, "EXPIRED");

    const invalidPage = await fetch(`${fixture.baseUrl}/api/bookings/mine?page=0`, {
      headers: { Cookie: ownerCookie }
    });
    assert.equal(invalidPage.status, 400);
  } finally {
    await fixture.close();
  }
});

test("customer cancellation is owner-scoped, idempotent, and restores inventory", async () => {
  const fixture = await createFixture();
  try {
    const ownerCookie = await fixture.register("booking.cancel@example.test", "BOOK-CANCEL");
    const strangerCookie = await fixture.register("booking.cancel.other@example.test", "BOOK-CANCEL-OTHER");
    await fixture.pool.execute(
      "INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate) VALUES ('Cancel One', 2, 700, 100)"
    );
    const [[{ roomTypeId }]] = await fixture.pool.query("SELECT LAST_INSERT_ID() AS roomTypeId");
    await fixture.pool.execute(
      "INSERT INTO Room (room_type_id, room_code, current_status) VALUES (?, 'CANCEL001', 'AVAILABLE')",
      [roomTypeId]
    );
    const created = await fixture.postBooking(ownerCookie, bookingBody({ roomTypeId }));
    assert.equal(created.response.status, 201);

    const stranger = await actionRequest(fixture.baseUrl, created.body.data.id, "cancel", strangerCookie, {
      reason: "Not mine"
    });
    assert.equal(stranger.response.status, 404);

    const cancelled = await actionRequest(fixture.baseUrl, created.body.data.id, "cancel", ownerCookie, {
      reason: "Travel plans changed"
    });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.data.status, "CANCELLED");
    const repeated = await actionRequest(fixture.baseUrl, created.body.data.id, "cancel", ownerCookie, {
      reason: "Travel plans changed"
    });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.body.data.status, "CANCELLED");

    const replacement = await fixture.postBooking(strangerCookie, bookingBody({ roomTypeId }));
    assert.equal(replacement.response.status, 201);
    const [[auditCount]] = await fixture.pool.execute(
      "SELECT COUNT(*) AS count FROM AuditLog WHERE entity_type = 'Booking' AND entity_id = ? AND action = 'BOOKING_CANCELLED'",
      [created.body.data.id]
    );
    assert.equal(Number(auditCount.count), 1);

    await fixture.pool.execute("UPDATE Booking SET status = 'CHECKED_IN' WHERE booking_id = ?", [replacement.body.data.id]);
    const invalid = await actionRequest(fixture.baseUrl, replacement.body.data.id, "cancel", strangerCookie, {
      reason: "Too late"
    });
    assert.equal(invalid.response.status, 409);

    const sameDay = await fixture.postBooking(ownerCookie, bookingBody({ roomTypeId: 2 }));
    await fixture.pool.execute(`
      UPDATE Booking
      SET status = 'CONFIRMED', check_in_date = CURRENT_DATE,
          check_out_date = DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
      WHERE booking_id = ?
    `, [sameDay.body.data.id]);
    const sameDayCancel = await actionRequest(fixture.baseUrl, sameDay.body.data.id, "cancel", ownerCookie, {
      reason: "Already arrival day"
    });
    assert.equal(sameDayCancel.response.status, 409);
  } finally {
    await fixture.close();
  }
});

test("confirmed customer can declare late arrival once inside the stay window", async () => {
  const fixture = await createFixture();
  try {
    const cookie = await fixture.register("booking.late@example.test", "BOOK-LATE");
    const created = await fixture.postBooking(cookie, bookingBody());
    await fixture.pool.execute("UPDATE Booking SET status = 'CONFIRMED' WHERE booking_id = ?", [created.body.data.id]);

    const late = await actionRequest(fixture.baseUrl, created.body.data.id, "late-arrival", cookie, {
      expectedArrivalAt: "2037-04-10T20:00:00+07:00"
    });
    assert.equal(late.response.status, 200);
    assert.equal(late.body.data.status, "LATE_ARRIVAL");
    assert.ok(late.body.data.expectedArrivalAt);

    const repeated = await actionRequest(fixture.baseUrl, created.body.data.id, "late-arrival", cookie, {
      expectedArrivalAt: "2037-04-10T20:00:00+07:00"
    });
    assert.equal(repeated.response.status, 200);
    const [[auditCount]] = await fixture.pool.execute(
      "SELECT COUNT(*) AS count FROM AuditLog WHERE entity_type = 'Booking' AND entity_id = ? AND action = 'LATE_ARRIVAL_DECLARED'",
      [created.body.data.id]
    );
    assert.equal(Number(auditCount.count), 1);

    const second = await fixture.postBooking(cookie, { ...bookingBody({ roomTypeId: 2 }), checkIn: "2037-05-10", checkOut: "2037-05-11" });
    await fixture.pool.execute("UPDATE Booking SET status = 'CONFIRMED' WHERE booking_id = ?", [second.body.data.id]);
    const outside = await actionRequest(fixture.baseUrl, second.body.data.id, "late-arrival", cookie, {
      expectedArrivalAt: "2037-05-12T08:00:00+07:00"
    });
    assert.equal(outside.response.status, 400);
  } finally {
    await fixture.close();
  }
});

test("reception creates a same-day walk-in and staff views preserve channel distinctions", async () => {
  const fixture = await createFixture();
  try {
    const receptionCookie = await createEmployeeSession(fixture, {
      email: "booking.reception@example.test",
      role: "RECEPTION"
    });
    const housekeepingCookie = await createEmployeeSession(fixture, {
      email: "booking.housekeeping@example.test",
      role: "HOUSEKEEPING"
    });
    const [[todayRow]] = await fixture.pool.query("SELECT DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS today");
    const tomorrow = addDays(todayRow.today, 1);

    const denied = await fetch(`${fixture.baseUrl}/api/staff/bookings/walk-in`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: fixture.baseUrl, Cookie: housekeepingCookie },
      body: JSON.stringify({})
    });
    assert.equal(denied.status, 403);

    const failedWalkIn = await fetch(`${fixture.baseUrl}/api/staff/bookings/walk-in`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: fixture.baseUrl, Cookie: receptionCookie },
      body: JSON.stringify({
        checkIn: todayRow.today,
        checkOut: tomorrow,
        rooms: [{ roomTypeId: 1, guestCount: 2 }],
        breakfastDates: [],
        promotionCodes: [],
        paymentChoice: "full",
        customer: {
          fullName: "Rolled Back Guest",
          phone: "0888888888",
          identityType: "PASSPORT",
          identityNumber: "ROLLBACK-001"
        },
        roomAssignments: [301]
      })
    });
    assert.equal(failedWalkIn.status, 400);
    const [[rolledBackCustomer]] = await fixture.pool.execute(
      "SELECT COUNT(*) AS count FROM Customer WHERE identity_number = 'ROLLBACK-001'"
    );
    assert.equal(Number(rolledBackCustomer.count), 0);

    await fixture.pool.execute("UPDATE Room SET current_status = 'OCCUPIED' WHERE room_id = 1");
    const occupiedAssignment = await fetch(`${fixture.baseUrl}/api/staff/bookings/walk-in`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: fixture.baseUrl, Cookie: receptionCookie },
      body: JSON.stringify({
        checkIn: todayRow.today,
        checkOut: tomorrow,
        rooms: [{ roomTypeId: 1, guestCount: 2 }],
        breakfastDates: [],
        promotionCodes: [],
        paymentChoice: "full",
        customer: {
          fullName: "Occupied Guest",
          phone: "0877777777",
          identityType: "PASSPORT",
          identityNumber: "OCCUPIED-001"
        },
        roomAssignments: [1]
      })
    });
    assert.equal(occupiedAssignment.status, 409);
    await fixture.pool.execute("UPDATE Room SET current_status = 'AVAILABLE' WHERE room_id = 1");

    const response = await fetch(`${fixture.baseUrl}/api/staff/bookings/walk-in`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: fixture.baseUrl, Cookie: receptionCookie },
      body: JSON.stringify({
        checkIn: todayRow.today,
        checkOut: tomorrow,
        rooms: [{ roomTypeId: 1, guestCount: 2 }],
        breakfastDates: [],
        promotionCodes: [],
        paymentChoice: "full",
        customer: {
          fullName: "Walk In Guest",
          phone: "0899999999",
          identityType: "PASSPORT",
          identityNumber: "WALK-001"
        },
        roomAssignments: [1]
      })
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.data.status, "CONFIRMED");
    assert.equal(body.data.channel, "WALK_IN");
    assert.equal(body.data.holdExpiresAt, null);

    const [[customer]] = await fixture.pool.execute(
      "SELECT member_status AS memberStatus, email, password_hash AS passwordHash FROM Customer WHERE identity_number = 'WALK-001'"
    );
    assert.deepEqual(customer, { memberStatus: "WALK_IN", email: null, passwordHash: null });
    const [[assignment]] = await fixture.pool.execute(
      "SELECT room_id AS roomId, assigned_by AS assignedBy FROM RoomAssignment WHERE booking_room_id = ?",
      [body.data.rooms[0].id]
    );
    assert.equal(assignment.roomId, 1);
    assert.ok(assignment.assignedBy);

    const listResponse = await fetch(`${fixture.baseUrl}/api/staff/bookings?channel=WALK_IN`, {
      headers: { Cookie: receptionCookie }
    });
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].channel, "WALK_IN");

    const detailResponse = await fetch(`${fixture.baseUrl}/api/staff/bookings/${body.data.id}`, {
      headers: { Cookie: receptionCookie }
    });
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.data.customer.fullName, "Walk In Guest");
    assert.equal(detail.data.rooms[0].assignedRoomId, 1);

    const deniedList = await fetch(`${fixture.baseUrl}/api/staff/bookings`, {
      headers: { Cookie: housekeepingCookie }
    });
    assert.equal(deniedList.status, 403);

    const concurrentCustomer = {
      fullName: "Concurrent Walk In",
      phone: "0866666666",
      identityType: "PASSPORT",
      identityNumber: "WALK-CONCURRENT-001"
    };
    const concurrentWalkIns = await Promise.all([2, 3].map((roomTypeId) =>
      fetch(`${fixture.baseUrl}/api/staff/bookings/walk-in`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: fixture.baseUrl, Cookie: receptionCookie },
        body: JSON.stringify({
          checkIn: todayRow.today,
          checkOut: tomorrow,
          rooms: [{ roomTypeId, guestCount: 2 }],
          breakfastDates: [],
          promotionCodes: [],
          paymentChoice: "full",
          customer: concurrentCustomer,
          roomAssignments: []
        })
      })
    ));
    assert.deepEqual(concurrentWalkIns.map(({ status }) => status), [201, 201]);
    const [[customerCount]] = await fixture.pool.execute(
      "SELECT COUNT(*) AS count FROM Customer WHERE identity_number = 'WALK-CONCURRENT-001'"
    );
    assert.equal(Number(customerCount.count), 1);
  } finally {
    await fixture.close();
  }
});

test("booking rejects monetary snapshots that exceed DECIMAL(12,2)", async () => {
  const fixture = await createFixture();
  try {
    const cookie = await fixture.register("booking.amount@example.test", "BOOK-AMOUNT");
    await fixture.pool.execute(
      "INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate) VALUES ('Huge Rate', 2, 9999999999.99, 0)"
    );
    const [[{ roomTypeId }]] = await fixture.pool.query("SELECT LAST_INSERT_ID() AS roomTypeId");
    await fixture.pool.execute(
      "INSERT INTO Room (room_type_id, room_code, current_status) VALUES (?, 'HUGE001', 'AVAILABLE')",
      [roomTypeId]
    );
    const result = await fixture.postBooking(cookie, {
      ...bookingBody({ roomTypeId }),
      checkOut: "2037-04-12"
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.code, "BOOKING_AMOUNT_TOO_LARGE");
  } finally {
    await fixture.close();
  }
});

function bookingBody({ roomTypeId = 1, guestCount = 2 } = {}) {
  return {
    checkIn: "2037-04-10",
    checkOut: "2037-04-11",
    rooms: [{ roomTypeId, guestCount }],
    breakfastDates: [],
    promotionCodes: [],
    paymentChoice: "deposit"
  };
}

async function actionRequest(baseUrl, bookingId, action, cookie, body) {
  const response = await fetch(`${baseUrl}/api/bookings/${bookingId}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: baseUrl, Cookie: cookie },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

async function createFixture() {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig: {
      secret: "booking-integration-secret-at-least-32-characters",
      tokenTtlSeconds: 900,
      cookieName: "tkc_session",
      secureCookie: false
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    pool,
    baseUrl,
    async register(email, identityNumber) {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: baseUrl },
        body: JSON.stringify({
          full_name: "Booking Test",
          email,
          phone: "0812345678",
          identity_type: "ID_CARD",
          identity_number: identityNumber,
          password: "BookingPass123!"
        })
      });
      assert.equal(response.status, 201);
      return response.headers.get("set-cookie").split(";", 1)[0];
    },
    async postBooking(cookie, body) {
      const response = await fetch(`${baseUrl}/api/bookings`, {
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

async function createEmployeeSession(fixture, { email, role }) {
  const password = "EmployeeBooking123!";
  await fixture.pool.execute(`
    INSERT INTO Employee
      (department_name, role_name, name, email, password_hash, active)
    VALUES ('Front Office', ?, 'Booking Staff', ?, ?, TRUE)
  `, [role, email, await bcrypt.hash(password, 4)]);
  const response = await fetch(`${fixture.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: fixture.baseUrl },
    body: JSON.stringify({ account_type: "employee", email, password })
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
