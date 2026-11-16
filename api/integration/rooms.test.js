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

test("public room type catalog is loaded from MySQL", async () => {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig: {
      secret: "room-integration-secret-at-least-32-characters",
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

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/room-types`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.length, 4);
    assert.deepEqual(body.data[0], {
      id: 1,
      name: "Standard Room",
      capacity: 2,
      pricePerNight: "1000.00",
      breakfastDailyRate: "350.00",
      totalRooms: 300
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
});

test("availability counts active bookings and effective closures", async () => {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const fixtureConnection = await mysql.createConnection({
    ...databaseConfig,
    multipleStatements: true
  });
  await fixtureConnection.query(`
    INSERT INTO Customer
      (full_name, email, phone, identity_type, identity_number, password_hash,
       member_status, registered_at, active)
    VALUES
      ('Room Test', 'rooms@example.test', '0800000000', 'ID_CARD', 'ROOM-1',
       'fixture-hash', 'ACTIVE', CURRENT_TIMESTAMP, TRUE);
    INSERT INTO Booking
      (booking_code, customer_id, status, check_in_date, check_out_date,
       hold_expires_at, deposit_rate, total_snapshot)
    VALUES
      ('ROOM-CONFIRMED', 1, 'CONFIRMED', '2037-01-10', '2037-01-12', NULL, 50, 1000),
      ('ROOM-HOLD', 1, 'PENDING_PAYMENT', '2037-01-10', '2037-01-12',
       DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR), 50, 1000),
      ('ROOM-EXPIRED', 1, 'PENDING_PAYMENT', '2037-01-10', '2037-01-12',
       DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR), 50, 1000);
    INSERT INTO BookingRoom
      (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
    VALUES (1, 1, 2, 1000, 2000), (2, 1, 2, 1000, 2000), (3, 1, 2, 1000, 2000);
    UPDATE Room SET current_status = 'OUT_OF_SERVICE' WHERE room_id = 2;
    INSERT INTO RoomEvent
      (room_id, event_type, status, related_event_id, effective_from, effective_to)
    VALUES
      (1, 'ROOM_CLOSED', 'ACTIVE', NULL, '2037-01-09 00:00:00', '2037-01-13 00:00:00'),
      (3, 'ROOM_CLOSED', 'ACTIVE', NULL, '2037-01-01 00:00:00', NULL),
      (3, 'ROOM_REOPENED', 'COMPLETED', 2, '2037-01-10 00:00:00', NULL);
  `);
  await fixtureConnection.end();
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig: {
      secret: "room-integration-secret-at-least-32-characters",
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

  try {
    const response = await fetch(
      `${baseUrl}/api/rooms/availability?checkIn=2037-01-10&checkOut=2037-01-12`
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    const standard = body.data.find(({ id }) => id === 1);
    assert.equal(standard.totalRooms, 300);
    assert.equal(standard.reservedRooms, 2);
    assert.equal(standard.closedRooms, 1);
    assert.equal(standard.availableRooms, 297);

    const adjacent = await fetch(
      `${baseUrl}/api/rooms/availability?checkIn=2037-01-12&checkOut=2037-01-13`
    );
    const adjacentStandard = (await adjacent.json()).data.find(({ id }) => id === 1);
    assert.equal(adjacentStandard.reservedRooms, 0);
    assert.equal(adjacentStandard.closedRooms, 1);

    const capacity = await fetch(
      `${baseUrl}/api/rooms/availability?checkIn=2037-01-10&checkOut=2037-01-12&guests=3`
    );
    assert.equal(capacity.status, 200);
    assert.ok((await capacity.json()).data.every(({ capacity }) => capacity >= 3));

    const invalid = await fetch(
      `${baseUrl}/api/rooms/availability?checkIn=2037-02-30&checkOut=2037-01-12`
    );
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
});

test("authorized staff list rooms and update status with optimistic versioning", async () => {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const password = "HousekeepingPass123!";
  await pool.execute(
    `INSERT INTO Employee
       (department_name, role_name, name, email, password_hash, active)
     VALUES ('Front Office', 'RECEPTION', 'Reception Test', ?, ?, TRUE)`,
    ["reception.rooms@example.test", await bcrypt.hash(password, 4)]
  );
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig: {
      secret: "room-integration-secret-at-least-32-characters",
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

  try {
    const anonymous = await fetch(`${baseUrl}/api/staff/rooms`);
    assert.equal(anonymous.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: baseUrl },
      body: JSON.stringify({
        account_type: "employee",
        email: "reception.rooms@example.test",
        password
      })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];

    const list = await fetch(`${baseUrl}/api/staff/rooms?status=AVAILABLE&limit=2`, {
      headers: { Cookie: cookie }
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.data.length, 2);
    assert.ok(listBody.data.every(({ status }) => status === "AVAILABLE"));

    const forbiddenCatalog = await fetch(`${baseUrl}/api/staff/room-types`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: baseUrl,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Forbidden Type",
        capacity: 2,
        pricePerNight: "1000.00",
        breakfastDailyRate: "350.00"
      })
    });
    assert.equal(forbiddenCatalog.status, 403);

    const forbiddenClosure = await fetch(`${baseUrl}/api/staff/rooms/1/status`, {
      method: "PATCH",
      headers: { Cookie: cookie, Origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ status: "OUT_OF_SERVICE", expectedVersion: 0, reason: "Not allowed" })
    });
    assert.equal(forbiddenClosure.status, 403);

    const update = await fetch(`${baseUrl}/api/staff/rooms/1/status`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: baseUrl,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        status: "OCCUPIED",
        expectedVersion: 0,
        reason: "Checkout cleaning test"
      })
    });
    assert.equal(update.status, 200);
    const updatedRoom = (await update.json()).data;
    assert.equal(updatedRoom.status, "OCCUPIED");
    assert.equal(updatedRoom.statusVersion, 1);

    const stale = await fetch(`${baseUrl}/api/staff/rooms/1/status`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: baseUrl,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        status: "NEEDS_CLEANING",
        expectedVersion: 0,
        reason: "Stale request"
      })
    });
    assert.equal(stale.status, 409);

    const concurrentRequests = ["Concurrent A", "Concurrent B"].map((reason) =>
      fetch(`${baseUrl}/api/staff/rooms/2/status`, {
        method: "PATCH",
        headers: { Cookie: cookie, Origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ status: "OCCUPIED", expectedVersion: 0, reason })
      })
    );
    const concurrentStatuses = (await Promise.all(concurrentRequests))
      .map(({ status }) => status).sort();
    assert.deepEqual(concurrentStatuses, [200, 409]);

    const badLimit = await fetch(`${baseUrl}/api/staff/rooms?limit=1e2`, {
      headers: { Cookie: cookie }
    });
    assert.equal(badLimit.status, 400);

    const nullVersion = await fetch(`${baseUrl}/api/staff/rooms/3/status`, {
      method: "PATCH",
      headers: { Cookie: cookie, Origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ status: "OCCUPIED", expectedVersion: null, reason: "Bad version" })
    });
    assert.equal(nullVersion.status, 400);

    const [audits] = await pool.execute(
      "SELECT actor_type, actor_employee_id, action FROM AuditLog WHERE entity_type = 'Room' AND entity_id = 1"
    );
    assert.deepEqual(audits.map(({ actor_type, action }) => ({ actor_type, action })), [
      { actor_type: "EMPLOYEE", action: "STATUS_CHANGED" }
    ]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
});

test("superadmin creates and updates room catalog records", async () => {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const password = "SuperadminPass123!";
  await pool.execute(
    `INSERT INTO Employee
       (department_name, role_name, name, email, password_hash, active)
     VALUES ('Administration', 'SUPERADMIN', 'Superadmin Test', ?, ?, TRUE)`,
    ["superadmin@example.test", await bcrypt.hash(password, 4)]
  );
  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig: {
      secret: "room-integration-secret-at-least-32-characters",
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

  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { Origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({
        account_type: "employee",
        email: "superadmin@example.test",
        password
      })
    });
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];
    const headers = { Cookie: cookie, Origin: baseUrl, "content-type": "application/json" };

    await pool.execute(`INSERT INTO Customer
      (full_name, email, phone, identity_type, identity_number, password_hash,
       member_status, registered_at, active)
      VALUES ('Assigned Guest', 'assigned@example.test', '0800000000', 'ID_CARD',
              'ASSIGNED-1', 'fixture-hash', 'ACTIVE', CURRENT_TIMESTAMP, TRUE)`);
    await pool.execute(`INSERT INTO Booking
      (booking_code, customer_id, status, check_in_date, check_out_date,
       deposit_rate, total_snapshot)
      VALUES ('ASSIGNED-ROOM', 1, 'CONFIRMED', '2037-02-01', '2037-02-03', 50, 2000)`);
    await pool.execute(`INSERT INTO BookingRoom
      (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
      VALUES (1, 1, 2, 1000, 2000)`);
    await pool.execute(`INSERT INTO RoomAssignment
      (booking_room_id, room_id, assigned_by, effective_from)
      VALUES (1, 1, 1, '2037-02-01 14:00:00')`);

    const incompatibleType = await fetch(`${baseUrl}/api/staff/rooms/1`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        roomTypeId: 2,
        code: "STD001",
        area: "Changed",
        expectedVersion: 0
      })
    });
    assert.equal(incompatibleType.status, 409);

    const createType = await fetch(`${baseUrl}/api/staff/room-types`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Garden Suite",
        capacity: 4,
        pricePerNight: "3200.00",
        breakfastDailyRate: "500.00"
      })
    });
    assert.equal(createType.status, 201);
    const roomType = (await createType.json()).data;

    const updateType = await fetch(`${baseUrl}/api/staff/room-types/${roomType.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        name: "Garden Family Suite",
        capacity: 5,
        pricePerNight: "3500.00",
        breakfastDailyRate: "550.00"
      })
    });
    assert.equal(updateType.status, 200);
    assert.equal((await updateType.json()).data.pricePerNight, "3500.00");

    const createRoom = await fetch(`${baseUrl}/api/staff/rooms`, {
      method: "POST",
      headers,
      body: JSON.stringify({ roomTypeId: roomType.id, code: "GDN001", area: "Garden Wing" })
    });
    assert.equal(createRoom.status, 201);
    const room = (await createRoom.json()).data;

    const updateRoom = await fetch(`${baseUrl}/api/staff/rooms/${room.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        roomTypeId: roomType.id,
        code: "GDN002",
        area: "New Garden Wing",
        expectedVersion: 0
      })
    });
    assert.equal(updateRoom.status, 200);
    const updated = (await updateRoom.json()).data;
    assert.equal(updated.code, "GDN002");
    assert.equal(updated.statusVersion, 1);

    const [records] = await pool.execute(
      "SELECT room_code, area FROM Room WHERE room_id = ?",
      [room.id]
    );
    assert.deepEqual(records[0], { room_code: "GDN002", area: "New Garden Wing" });
    const [audits] = await pool.execute(
      "SELECT action FROM AuditLog WHERE entity_type IN ('RoomType', 'Room') ORDER BY audit_log_id"
    );
    assert.deepEqual(audits.map(({ action }) => action), [
      "CATALOG_CREATED", "CATALOG_UPDATED", "CATALOG_CREATED", "CATALOG_UPDATED"
    ]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
});
