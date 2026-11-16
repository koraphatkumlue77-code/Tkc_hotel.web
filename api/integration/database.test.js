import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

import { runPreflight } from "../scripts/preflight-plan-b.js";
import {
  configFromEnvironment,
  resetTestDatabase
} from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(API_ROOT, "..");
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("real MySQL legacy preflight and deterministic reset", async (context) => {
  const config = configFromEnvironment();
  const connection = await mysql.createConnection({ ...config, multipleStatements: true });

  try {
    await context.test("clean legacy schema passes", async () => {
      await resetLegacyFixture(connection);
      const result = await runPreflight(connection);
      assert.equal(result.ok, true);
    });

    await context.test("invalid legacy rows block migration", async () => {
      await resetLegacyFixture(connection);
      await connection.query(`
        INSERT INTO Customer
          (full_name, email, phone, identity_type, identity_number)
        VALUES
          ('One', 'duplicate@example.test', '1', 'ID', '1'),
          ('Two', 'duplicate@example.test', '2', 'ID', '2');
        INSERT INTO Room (room_type_id, room_code, current_status)
          VALUES (1, 'Bad001', 'DIRTY');
        INSERT INTO Booking
          (customer_id, status, check_in_date, check_out_date, deposit_rate, total_snapshot)
          VALUES (1, 'PENDING', '2026-01-02', '2026-01-01', 50, -1);
        INSERT INTO Payment
          (booking_id, method, amount, status, submitted_at)
          VALUES (1, 'CASH', 0, 'PENDING', CURRENT_TIMESTAMP);
        INSERT INTO Service (name, charge_unit, default_rate)
          VALUES ('Duplicate', 'UNIT', 0), ('Duplicate', 'UNIT', -1);
        INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate)
          VALUES ('Bad', 0, -1, -1);
        INSERT INTO BookingRoom
          (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
          VALUES (1, 1, 0, -1, -1);
        INSERT INTO BookingService (booking_id, service_type) VALUES (1, 1);
        INSERT INTO ServiceUsage
          (booking_service_id, booking_room_id, unit_price_snapshot, quantity)
          VALUES (1, 1, -1, 0);
        INSERT INTO TourReservation (booking_id, tour_date, start_time, status)
        VALUES
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT'),
          (1, '2026-01-01', '18:00', 'PENDING_PAYMENT');
      `);

      const result = await runPreflight(connection);
      assert.equal(result.ok, false);
      for (const key of [
        "duplicate-customer-email",
        "invalid-room-status",
        "invalid-booking-values",
        "invalid-payment-amount",
        "duplicate-service-name",
        "invalid-service-rate",
        "invalid-room-type-values",
        "invalid-booking-room-values",
        "invalid-service-usage-values",
        "invalid-tour-capacity"
      ]) {
        assert.ok(result.checks.find((item) => item.key === key).count > 0, key);
      }
    });

    await context.test("partial B-01/B-02 state is rejected", async () => {
      await resetLegacyFixture(connection);
      await connection.query(`
        ALTER TABLE Customer
          ADD COLUMN member_status ENUM('WALK_IN','ACTIVE','SUSPENDED')
            NOT NULL DEFAULT 'WALK_IN';
        ALTER TABLE Booking ADD COLUMN booking_code VARCHAR(20) NOT NULL;
      `);
      const result = await runPreflight(connection, { resumeAfter: 2 });
      assert.equal(result.ok, false);
      assert.ok(result.checks.find((item) => item.key === "resume-contract-columns").count > 0);
    });

    await context.test("complete B-01/B-02 state is accepted", async () => {
      await resetLegacyFixture(connection);
      const canonicalSql = await readFile(
        path.join(REPOSITORY_ROOT, "database", "Tkcdata.sql"),
        "utf8"
      );
      const firstTwoBlocks = canonicalSql
        .slice(canonicalSql.indexOf("-- [PLAN B-01]"), canonicalSql.indexOf("-- [PLAN B-03]"))
        .replaceAll("tkc_hotel_dev", config.database);
      await connection.query(firstTwoBlocks);
      const result = await runPreflight(connection, { resumeAfter: 2 });
      assert.equal(result.ok, true);
    });

    await context.test("Plan B migration matches the exported canonical schema", async () => {
      await resetLegacyFixture(connection);
      const canonicalSql = await readFile(
        path.join(REPOSITORY_ROOT, "database", "Tkcdata.sql"),
        "utf8"
      );
      const planB = canonicalSql
        .slice(canonicalSql.indexOf("-- [PLAN B-01]"), canonicalSql.indexOf("-- PLAN B POSTCHECK"))
        .replaceAll("tkc_hotel_dev", config.database);
      await connection.query(planB);
      const facilityMigration = await readFile(
        path.join(REPOSITORY_ROOT, "database", "migrations", "2026-11-17-facility-tour-booking.sql"),
        "utf8"
      );
      await connection.query(facilityMigration.replaceAll("tkc_hotel_dev", config.database));
      const migrated = await schemaSignature(connection);

      await resetTestDatabase(config);
      const exported = await schemaSignature(connection);
      assert.deepEqual(migrated, exported);
    });
  } finally {
    await connection.end();
  }

  const first = await resetTestDatabase(config);
  const second = await resetTestDatabase(config);
  assert.deepEqual(second, first);
  assert.deepEqual(second, {
    database: config.database,
    tables: 19,
    roomTypes: 4,
    rooms: 800,
    services: 7
  });

  const verificationConnection = await mysql.createConnection(config);
  try {
    const [roundTimeColumn] = await verificationConnection.query(`
      SELECT column_type AS columnType, is_nullable AS nullable
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'ServiceUsage'
        AND column_name = 'start_time'
    `);
    assert.deepEqual(roundTimeColumn, [{ columnType: "time", nullable: "YES" }]);

    const [catalog] = await verificationConnection.query(`
      SELECT name, service_kind AS serviceKind, charge_unit AS chargeUnit,
             CAST(default_rate AS CHAR) AS defaultRate, schedule_json AS schedule
      FROM Service
      WHERE name IN ('ฟิตเนส', 'ซาวน่า', 'เที่ยวตลาดกลางคืน',
                     'ชมพระอาทิตย์ตก - เกาะสวรรค์', 'ชมพระอาทิตย์ตก - ริมชายหาด')
      ORDER BY service_id
    `);
    assert.deepEqual(catalog.map((row) => ({ ...row, schedule: jsonValue(row.schedule) })), [
    {
      name: "ฟิตเนส", serviceKind: "FITNESS", chargeUnit: "PER_PERSON_PER_ROUND",
      defaultRate: "500.00",
      schedule: { times: ["07:00", "09:00", "12:00", "15:00", "18:00", "20:30"], capacity: 40 }
    },
    {
      name: "ซาวน่า", serviceKind: "SAUNA", chargeUnit: "PER_PERSON_PER_ROUND",
      defaultRate: "300.00",
      schedule: { times: ["07:00", "12:00", "17:30", "18:30", "19:30", "20:30"] }
    },
    {
      name: "เที่ยวตลาดกลางคืน", serviceKind: "TOUR", chargeUnit: "PER_PERSON_PER_ROUND",
      defaultRate: "0.00",
      schedule: { location: "ตลาดกลางคืน", times: ["19:30", "20:00", "20:30"], capacity: 10 }
    },
    {
      name: "ชมพระอาทิตย์ตก - เกาะสวรรค์", serviceKind: "TOUR", chargeUnit: "PER_PERSON_PER_ROUND",
      defaultRate: "0.00",
      schedule: { location: "เกาะสวรรค์", times: sunsetTimes(), capacity: 10 }
    },
    {
      name: "ชมพระอาทิตย์ตก - ริมชายหาด", serviceKind: "TOUR", chargeUnit: "PER_PERSON_PER_ROUND",
      defaultRate: "0.00",
      schedule: { location: "ริมชายหาด", times: sunsetTimes(), capacity: 10 }
    }
    ]);
  } finally {
    await verificationConnection.end();
  }
});

function sunsetTimes() {
  return ["15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30"];
}

function jsonValue(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function resetLegacyFixture(connection) {
  const [tables] = await connection.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
  `);
  const dropSql = tables.length === 0
    ? ""
    : `DROP TABLE IF EXISTS ${tables.map(({ TABLE_NAME }) => `\`${TABLE_NAME.replaceAll("`", "``")}\``).join(", ")};`;
  const canonicalSql = await readFile(
    path.join(REPOSITORY_ROOT, "database", "Tkcdata.sql"),
    "utf8"
  );
  const fixture = canonicalSql
    .slice(0, canonicalSql.indexOf("-- PLAN B START"))
    .replace(/^CREATE DATABASE[^;]+;\s*/i, "")
    .replaceAll("tkc_hotel_dev", process.env.TEST_DB_NAME);
  await connection.query(`
    SET FOREIGN_KEY_CHECKS = 0;
    ${dropSql}
    SET FOREIGN_KEY_CHECKS = 1;
    ${fixture}
  `);
}

async function schemaSignature(connection) {
  const [columns] = await connection.query(`
    SELECT table_name, column_name, column_type, is_nullable,
           COALESCE(CAST(column_default AS CHAR), '<NULL>') AS column_default
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    ORDER BY table_name, ordinal_position
  `);
  const [constraints] = await connection.query(`
    SELECT table_name, constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
    ORDER BY table_name, constraint_name
  `);
  const [indexes] = await connection.query(`
    SELECT table_name, index_name, non_unique, seq_in_index, column_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
    ORDER BY table_name, index_name, seq_in_index
  `);
  const [keyColumns] = await connection.query(`
    SELECT table_name, constraint_name, column_name, ordinal_position,
           referenced_table_name, referenced_column_name
    FROM information_schema.key_column_usage
    WHERE constraint_schema = DATABASE()
    ORDER BY table_name, constraint_name, ordinal_position
  `);
  const [referentialRules] = await connection.query(`
    SELECT table_name, constraint_name, update_rule, delete_rule
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
    ORDER BY table_name, constraint_name
  `);
  const [checks] = await connection.query(`
    SELECT constraint_name, check_clause
    FROM information_schema.check_constraints
    WHERE constraint_schema = DATABASE()
    ORDER BY constraint_name
  `);
  return { columns, constraints, indexes, keyColumns, referentialRules, checks };
}

