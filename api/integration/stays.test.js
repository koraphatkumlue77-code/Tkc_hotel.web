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

test("assignment enforces roles, type, and overlapping stays before Check-in", async () => {
  const fixture = await createFixture();
  try {
    const superadmin = await fixture.employee("stay.admin@example.test", "SUPERADMIN");
    const reception = await fixture.employee("stay.reception@example.test", "RECEPTION");
    const online = await fixture.booking({ channel: "ONLINE" });
    const [roomOne, roomTwo] = await fixture.rooms(online.roomTypeId, 2);

    const denied = await fixture.post(reception, `/api/staff/bookings/${online.id}/assignments`, {
      bookingRoomId: online.bookingRoomId,
      roomId: roomOne.id
    });
    assert.equal(denied.response.status, 403);

    const assigned = await fixture.post(superadmin, `/api/staff/bookings/${online.id}/assignments`, {
      bookingRoomId: online.bookingRoomId,
      roomId: roomOne.id,
      reason: "Initial allocation"
    });
    assert.equal(assigned.response.status, 201);
    assert.equal(assigned.body.data.roomCode, roomOne.code);

    const changed = await fixture.post(superadmin, `/api/staff/bookings/${online.id}/assignments`, {
      bookingRoomId: online.bookingRoomId,
      roomId: roomTwo.id,
      reason: "Guest preference"
    });
    assert.equal(changed.response.status, 201);
    assert.equal(changed.body.data.roomCode, roomTwo.code);

    const detailResponse = await fetch(`${fixture.baseUrl}/api/staff/bookings/${online.id}`, {
      headers: { Cookie: superadmin.cookie }
    });
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.data.rooms.length, 1);
    assert.equal(detail.data.rooms[0].assignedRoomId, roomTwo.id);

    const other = await fixture.booking({ channel: "ONLINE" });
    const overlap = await fixture.post(superadmin, `/api/staff/bookings/${other.id}/assignments`, {
      bookingRoomId: other.bookingRoomId,
      roomId: roomTwo.id
    });
    assert.equal(overlap.response.status, 409);
    assert.equal(overlap.body.code, "ROOM_ASSIGNMENT_CONFLICT");

    const [history] = await fixture.pool.execute(
      "SELECT room_id AS roomId, effective_from AS startsAt, effective_to AS endsAt FROM RoomAssignment WHERE booking_room_id = ? ORDER BY assignment_id",
      [online.bookingRoomId]
    );
    assert.equal(history.length, 2);
    assert.equal(new Date(history[0].startsAt).valueOf(), new Date(history[0].endsAt).valueOf());
  } finally {
    await fixture.close();
  }
});

test("Check-in requires complete assignments and No-show respects late-arrival time", async () => {
  const fixture = await createFixture();
  try {
    const reception = await fixture.employee("stay.arrival@example.test", "RECEPTION");
    const walkIn = await fixture.booking({ channel: "WALK_IN", rooms: 2 });
    const [roomOne, roomTwo] = await fixture.rooms(walkIn.roomTypeId, 2);
    await fixture.post(reception, `/api/staff/bookings/${walkIn.id}/assignments`, {
      bookingRoomId: walkIn.bookingRoomIds[0], roomId: roomOne.id
    });

    const incomplete = await fixture.post(reception, `/api/staff/bookings/${walkIn.id}/check-in`, {});
    assert.equal(incomplete.response.status, 409);
    assert.equal(incomplete.body.code, "ROOM_ASSIGNMENT_INCOMPLETE");

    await fixture.post(reception, `/api/staff/bookings/${walkIn.id}/assignments`, {
      bookingRoomId: walkIn.bookingRoomIds[1], roomId: roomTwo.id
    });
    const checkedIn = await fixture.post(reception, `/api/staff/bookings/${walkIn.id}/check-in`, {});
    assert.equal(checkedIn.response.status, 200);
    assert.equal(checkedIn.body.data.status, "CHECKED_IN");
    const [occupied] = await fixture.pool.execute(
      "SELECT current_status AS status FROM Room WHERE room_id IN (?, ?) ORDER BY room_id",
      [roomOne.id, roomTwo.id]
    );
    assert.deepEqual(occupied.map(({ status }) => status), ["OCCUPIED", "OCCUPIED"]);

    const late = await fixture.booking({ channel: "ONLINE", status: "LATE_ARRIVAL" });
    await fixture.pool.execute(
      "UPDATE Booking SET expected_arrival_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 HOUR) WHERE booking_id = ?",
      [late.id]
    );
    const tooEarly = await fixture.post(reception, `/api/staff/bookings/${late.id}/no-show`, { reason: "Not here" });
    assert.equal(tooEarly.response.status, 409);
    assert.equal(tooEarly.body.code, "NO_SHOW_TOO_EARLY");
    await fixture.pool.execute(
      "UPDATE Booking SET expected_arrival_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE booking_id = ?",
      [late.id]
    );
    const noShow = await fixture.post(reception, `/api/staff/bookings/${late.id}/no-show`, { reason: "Arrival window passed" });
    assert.equal(noShow.response.status, 200);
    assert.equal(noShow.body.data.status, "NO_SHOW");
  } finally {
    await fixture.close();
  }
});

test("management decides an emergency move once and approval queues old-room cleaning", async () => {
  const fixture = await createFixture();
  try {
    const reception = await fixture.employee("stay.move.reception@example.test", "RECEPTION");
    const management = await fixture.employee("stay.move.manager@example.test", "MANAGEMENT");
    const booking = await fixture.booking({ channel: "WALK_IN" });
    const [oldRoom, newRoom] = await fixture.rooms(booking.roomTypeId, 2);
    await fixture.post(reception, `/api/staff/bookings/${booking.id}/assignments`, {
      bookingRoomId: booking.bookingRoomId, roomId: oldRoom.id
    });
    await fixture.post(reception, `/api/staff/bookings/${booking.id}/check-in`, {});

    const request = await fixture.post(reception, `/api/staff/bookings/${booking.id}/emergency-moves`, {
      bookingRoomId: booking.bookingRoomId,
      roomId: newRoom.id,
      reason: "Water leak"
    });
    assert.equal(request.response.status, 201);

    const approval = await fixture.post(management, `/api/management/emergency-moves/${request.body.data.assignmentId}/approve`, {
      reason: "Move approved"
    });
    assert.equal(approval.response.status, 200);
    assert.equal(approval.body.data.status, "APPROVED");
    const [rooms] = await fixture.pool.execute(
      "SELECT room_id AS id, current_status AS status FROM Room WHERE room_id IN (?, ?) ORDER BY room_id",
      [oldRoom.id, newRoom.id]
    );
    assert.deepEqual(rooms, [
      { id: oldRoom.id, status: "NEEDS_CLEANING" },
      { id: newRoom.id, status: "OCCUPIED" }
    ]);
    const [[cleaning]] = await fixture.pool.execute(
      "SELECT COUNT(*) AS count FROM RoomEvent WHERE room_id = ? AND event_type = 'CLEANING_QUEUED'",
      [oldRoom.id]
    );
    assert.equal(Number(cleaning.count), 1);
    const repeated = await fixture.post(management, `/api/management/emergency-moves/${request.body.data.assignmentId}/approve`, {});
    assert.equal(repeated.response.status, 409);
    assert.equal(repeated.body.code, "EMERGENCY_MOVE_DECIDED");
  } finally {
    await fixture.close();
  }
});

test("Check-out blocks outstanding balance then queues cleaning atomically", async () => {
  const fixture = await createFixture();
  try {
    const reception = await fixture.employee("stay.checkout@example.test", "RECEPTION");
    const booking = await fixture.booking({ channel: "WALK_IN", total: "1000.00" });
    const [room] = await fixture.rooms(booking.roomTypeId, 1);
    await fixture.post(reception, `/api/staff/bookings/${booking.id}/assignments`, {
      bookingRoomId: booking.bookingRoomId, roomId: room.id
    });
    await fixture.post(reception, `/api/staff/bookings/${booking.id}/check-in`, {});

    const blocked = await fixture.post(reception, `/api/staff/bookings/${booking.id}/check-out`, {});
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.body.code, "BOOKING_BALANCE_DUE");
    assert.equal(blocked.body.details.outstanding, "1000.00");

    await fixture.pool.execute(`
      INSERT INTO Payment
        (booking_id, transaction_type, direction, verified_by, method, amount, status, submitted_at, verified_at)
      VALUES (?, 'BALANCE', 'IN', ?, 'CASH', 1000, 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [booking.id, reception.employeeId]);
    const checkedOut = await fixture.post(reception, `/api/staff/bookings/${booking.id}/check-out`, {});
    assert.equal(checkedOut.response.status, 200);
    assert.equal(checkedOut.body.data.status, "CHECKED_OUT");
    assert.equal(checkedOut.body.data.outstanding, "0.00");
    const [[stored]] = await fixture.pool.execute(`
      SELECT b.status, b.actual_check_out_at AS checkedOutAt,
             r.current_status AS roomStatus,
             (SELECT COUNT(*) FROM RoomEvent re WHERE re.room_id = r.room_id AND re.event_type = 'CLEANING_QUEUED') AS cleaningCount
      FROM Booking b
      JOIN BookingRoom br ON br.booking_id = b.booking_id
      JOIN RoomAssignment ra ON ra.booking_room_id = br.booking_room_id
      JOIN Room r ON r.room_id = ra.room_id
      WHERE b.booking_id = ? ORDER BY ra.assignment_id DESC LIMIT 1
    `, [booking.id]);
    assert.equal(stored.status, "CHECKED_OUT");
    assert.ok(stored.checkedOutAt);
    assert.equal(stored.roomStatus, "NEEDS_CLEANING");
    assert.equal(Number(stored.cleaningCount), 1);
  } finally {
    await fixture.close();
  }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig: {
      secret: "stay-integration-secret-at-least-32-characters",
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
  let customerSequence = 0;
  return {
    pool,
    baseUrl,
    async employee(email, role) {
      const password = "StayEmployee123!";
      const [result] = await pool.execute(`
        INSERT INTO Employee (department_name, role_name, name, email, password_hash, active)
        VALUES ('Hotel', ?, 'Stay Test', ?, ?, TRUE)
      `, [role, email, await bcrypt.hash(password, 4)]);
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: baseUrl },
        body: JSON.stringify({ account_type: "employee", email, password })
      });
      assert.equal(response.status, 200);
      return {
        cookie: response.headers.get("set-cookie").split(";", 1)[0],
        employeeId: Number(result.insertId)
      };
    },
    async booking({ channel, status = "CONFIRMED", rooms = 1, total = "1000.00" }) {
      customerSequence += 1;
      const [customer] = await pool.execute(`
        INSERT INTO Customer
          (full_name, email, phone, identity_type, identity_number, member_status, active)
        VALUES ('Stay Guest', ?, '0811111111', 'ID_CARD', ?, 'WALK_IN', TRUE)
      `, [`stay.guest.${customerSequence}@example.test`, `STAY-${customerSequence}`]);
      const [[roomType]] = await pool.execute("SELECT room_type_id AS id FROM RoomType ORDER BY room_type_id LIMIT 1");
      const today = bangkokDate();
      const checkout = addDays(today, 1);
      const [booking] = await pool.execute(`
        INSERT INTO Booking
          (booking_code, customer_id, status, status_changed_at, channel,
           check_in_date, check_out_date, deposit_rate, room_subtotal_snapshot,
           service_subtotal_snapshot, discount_total_snapshot, total_snapshot)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 100, ?, 0, 0, ?)
      `, [`STAY-${Date.now()}-${customerSequence}`, customer.insertId, status, channel, today, checkout, total, total]);
      const bookingRoomIds = [];
      for (let index = 0; index < rooms; index += 1) {
        const [bookingRoom] = await pool.execute(`
          INSERT INTO BookingRoom
            (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
          VALUES (?, ?, 1, ?, ?)
        `, [booking.insertId, roomType.id, total, total]);
        bookingRoomIds.push(Number(bookingRoom.insertId));
      }
      return {
        id: Number(booking.insertId),
        bookingRoomId: bookingRoomIds[0],
        bookingRoomIds,
        roomTypeId: Number(roomType.id)
      };
    },
    async rooms(roomTypeId, count) {
      const [rows] = await pool.execute(`
        SELECT room_id AS id, room_code AS code
        FROM Room WHERE room_type_id = ? AND current_status = 'AVAILABLE'
        ORDER BY room_id LIMIT ?
      `, [roomTypeId, count]);
      assert.equal(rows.length, count);
      return rows.map((row) => ({ id: Number(row.id), code: row.code }));
    },
    async post(session, pathname, body) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: baseUrl,
          ...(session?.cookie ? { Cookie: session.cookie } : {})
        },
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
  return new Date(value).toISOString().slice(0, 10);
}
