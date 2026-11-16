import "dotenv/config";

import { pathToFileURL } from "node:url";

import { createDatabasePool } from "../db.js";

export const PREFLIGHT_CHECKS = Object.freeze([
  check("duplicate-customer-email", `
    SELECT COUNT(*) AS blocking_count
    FROM (
      SELECT email
      FROM Customer
      WHERE email IS NOT NULL
      GROUP BY email
      HAVING COUNT(*) > 1
    ) AS duplicate_email
  `),
  check("invalid-room-status", `
    SELECT COUNT(*) AS blocking_count
    FROM Room
    WHERE current_status NOT IN (
      'AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING', 'OUT_OF_SERVICE'
    )
  `),
  check("invalid-booking-values", `
    SELECT COUNT(*) AS blocking_count
    FROM Booking
    WHERE check_out_date <= check_in_date OR total_snapshot < 0
  `),
  check("invalid-payment-amount", `
    SELECT COUNT(*) AS blocking_count
    FROM Payment
    WHERE amount <= 0
  `),
  check("duplicate-service-name", `
    SELECT COUNT(*) AS blocking_count
    FROM (
      SELECT name
      FROM Service
      GROUP BY name
      HAVING COUNT(*) > 1
    ) AS duplicate_service
  `),
  check("invalid-service-rate", `
    SELECT COUNT(*) AS blocking_count
    FROM Service
    WHERE default_rate < 0
  `),
  check("invalid-room-type-values", `
    SELECT COUNT(*) AS blocking_count
    FROM RoomType
    WHERE capacity <= 0
       OR price_per_night < 0
       OR breakfast_daily_rate < 0
  `),
  check("invalid-booking-room-values", `
    SELECT COUNT(*) AS blocking_count
    FROM BookingRoom
    WHERE guest_count <= 0
       OR nightly_rate_snapshot < 0
       OR net_amount < 0
  `),
  check("invalid-service-usage-values", `
    SELECT COUNT(*) AS blocking_count
    FROM ServiceUsage
    WHERE unit_price_snapshot < 0 OR quantity <= 0
  `),
  check("invalid-tour-capacity", `
    SELECT COALESCE(SUM(active_participant_rows - 10), 0) AS blocking_count
    FROM (
      SELECT COUNT(*) AS active_participant_rows
      FROM TourReservation
      WHERE status NOT IN ('CANCELLED', 'REJECTED', 'REFUNDED')
      GROUP BY tour_date, start_time
      HAVING COUNT(*) > 10
    ) AS over_capacity_round
  `),
  check("existing-plan-b-tables", `
    SELECT COUNT(*) AS blocking_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'Promotion', 'BookingPromotion', 'RoomEvent', 'TourRound',
        'Review', 'ChatMessage', 'AuditLog'
      )
  `),
  check("existing-plan-b-columns", `
    SELECT COUNT(*) AS blocking_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND (
        (table_name = 'Customer' AND column_name = 'member_status')
        OR (table_name = 'Booking' AND column_name = 'booking_code')
        OR (table_name = 'Payment' AND column_name = 'transaction_type')
        OR (table_name = 'Room' AND column_name = 'status_version')
        OR (table_name = 'Service' AND column_name = 'service_kind')
        OR (table_name = 'BookingService' AND column_name = 'service_id')
        OR (table_name = 'TourReservation' AND column_name = 'tour_round_id')
      )
  `),
  check("unexpected-legacy-table-count", `
    SELECT ABS(COUNT(*) - 12) AS blocking_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
  `)
]);

export async function detectCompletedMigration(pool) {
  const [rows] = await pool.query(`
    SELECT (
      (SELECT COUNT(*) FROM information_schema.tables
       WHERE table_schema = DATABASE()) = 19
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'TourReservation' AND column_name = 'tour_round_id'
      )
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'TourReservation' AND column_name IN ('tour_date', 'start_time')
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'AuditLog'
      )
    ) AS complete
  `);
  return Number(rows[0]?.complete) === 1;
}

const RESUME_AFTER_B02_CHECKS = Object.freeze([
  check("resume-contract-columns", `
    WITH expected AS (
      SELECT 'Customer' AS table_name, 'user_id' AS column_name, 'int' AS column_type, 'YES' AS is_nullable, '<NULL>' AS column_default
      UNION ALL SELECT 'Customer', 'member_status', 'enum(''WALK_IN'',''ACTIVE'',''SUSPENDED'')', 'NO', 'WALK_IN'
      UNION ALL SELECT 'Customer', 'registered_at', 'timestamp', 'YES', '<NULL>'
      UNION ALL SELECT 'Customer', 'last_login_at', 'timestamp', 'YES', '<NULL>'
      UNION ALL SELECT 'Customer', 'active', 'tinyint(1)', 'NO', '1'
      UNION ALL SELECT 'Customer', 'created_at', 'timestamp', 'NO', 'CURRENT_TIMESTAMP'
      UNION ALL SELECT 'Customer', 'updated_at', 'timestamp', 'NO', 'CURRENT_TIMESTAMP'
      UNION ALL SELECT 'Booking', 'booking_code', 'varchar(20)', 'NO', '<NULL>'
      UNION ALL SELECT 'Booking', 'status_changed_at', 'timestamp', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'status_changed_by', 'int', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'room_subtotal_snapshot', 'decimal(12,2)', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'service_subtotal_snapshot', 'decimal(12,2)', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'discount_total_snapshot', 'decimal(12,2)', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'actual_check_in_at', 'timestamp', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'actual_check_out_at', 'timestamp', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'checked_in_by', 'int', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'checked_out_by', 'int', 'YES', '<NULL>'
      UNION ALL SELECT 'Booking', 'created_at', 'timestamp', 'NO', 'CURRENT_TIMESTAMP'
      UNION ALL SELECT 'Booking', 'updated_at', 'timestamp', 'NO', 'CURRENT_TIMESTAMP'
    )
    SELECT COUNT(*) AS blocking_count
    FROM expected
    LEFT JOIN information_schema.columns AS actual
      ON actual.table_schema = DATABASE()
      AND actual.table_name = expected.table_name
      AND actual.column_name = expected.column_name
      AND LOWER(actual.column_type) = LOWER(expected.column_type)
      AND actual.is_nullable = expected.is_nullable
      AND COALESCE(CAST(actual.column_default AS CHAR), '<NULL>') = expected.column_default
    WHERE actual.column_name IS NULL
  `),
  check("resume-contract-constraints", `
    WITH expected AS (
      SELECT 'Customer' AS table_name, 'uq_customer_email' AS constraint_name, 'UNIQUE' AS constraint_type
      UNION ALL SELECT 'Customer', 'chk_customer_member_credentials', 'CHECK'
      UNION ALL SELECT 'Booking', 'uq_booking_code', 'UNIQUE'
      UNION ALL SELECT 'Booking', 'fk_booking_status_changed_by', 'FOREIGN KEY'
      UNION ALL SELECT 'Booking', 'fk_booking_checked_in_by', 'FOREIGN KEY'
      UNION ALL SELECT 'Booking', 'fk_booking_checked_out_by', 'FOREIGN KEY'
      UNION ALL SELECT 'Booking', 'chk_booking_date_range', 'CHECK'
      UNION ALL SELECT 'Booking', 'chk_booking_snapshot_amounts', 'CHECK'
    )
    SELECT COUNT(*) AS blocking_count
    FROM expected
    LEFT JOIN information_schema.table_constraints AS actual
      ON actual.constraint_schema = DATABASE()
      AND actual.table_name = expected.table_name
      AND actual.constraint_name = expected.constraint_name
      AND actual.constraint_type = expected.constraint_type
    WHERE actual.constraint_name IS NULL
  `),
  check("resume-contract-key-definitions", `
    WITH expected AS (
      SELECT 'Customer' AS table_name, 'uq_customer_email' AS constraint_name,
             'email' AS column_name, NULL AS referenced_table_name,
             NULL AS referenced_column_name, NULL AS update_rule, NULL AS delete_rule
      UNION ALL SELECT 'Booking', 'uq_booking_code', 'booking_code', NULL, NULL, NULL, NULL
      UNION ALL SELECT 'Booking', 'fk_booking_status_changed_by', 'status_changed_by', 'Employee', 'employee_id', 'RESTRICT', 'RESTRICT'
      UNION ALL SELECT 'Booking', 'fk_booking_checked_in_by', 'checked_in_by', 'Employee', 'employee_id', 'RESTRICT', 'RESTRICT'
      UNION ALL SELECT 'Booking', 'fk_booking_checked_out_by', 'checked_out_by', 'Employee', 'employee_id', 'RESTRICT', 'RESTRICT'
    )
    SELECT COUNT(*) AS blocking_count
    FROM expected
    LEFT JOIN information_schema.key_column_usage AS key_data
      ON key_data.constraint_schema = DATABASE()
      AND key_data.table_name = expected.table_name
      AND key_data.constraint_name = expected.constraint_name
      AND key_data.column_name = expected.column_name
      AND COALESCE(key_data.referenced_table_name, '<NULL>') = COALESCE(expected.referenced_table_name, '<NULL>')
      AND COALESCE(key_data.referenced_column_name, '<NULL>') = COALESCE(expected.referenced_column_name, '<NULL>')
    LEFT JOIN information_schema.referential_constraints AS rules
      ON rules.constraint_schema = key_data.constraint_schema
      AND rules.table_name = key_data.table_name
      AND rules.constraint_name = key_data.constraint_name
    WHERE key_data.constraint_name IS NULL
       OR (expected.referenced_table_name IS NOT NULL AND (
         rules.update_rule <> expected.update_rule OR rules.delete_rule <> expected.delete_rule
       ))
  `),
  check("resume-contract-check-definitions", `
    SELECT
      (NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_customer_member_credentials'
          AND check_clause LIKE '%member_status%'
          AND check_clause LIKE '%email%'
          AND check_clause LIKE '%password_hash%'
      ))
      + (NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_booking_date_range'
          AND check_clause LIKE '%check_out_date%'
          AND check_clause LIKE '%check_in_date%'
          AND check_clause LIKE '%>%'
      ))
      + (NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = DATABASE()
          AND constraint_name = 'chk_booking_snapshot_amounts'
          AND check_clause LIKE '%total_snapshot%'
          AND check_clause LIKE '%room_subtotal_snapshot%'
          AND check_clause LIKE '%service_subtotal_snapshot%'
          AND check_clause LIKE '%discount_total_snapshot%'
      )) AS blocking_count
  `),
  check("resume-contract-index", `
    WITH expected AS (
      SELECT 1 AS seq_in_index, 'status' AS column_name
      UNION ALL SELECT 2, 'check_in_date'
      UNION ALL SELECT 3, 'check_out_date'
      UNION ALL SELECT 4, 'hold_expires_at'
    )
    SELECT COUNT(*) AS blocking_count
    FROM expected
    LEFT JOIN information_schema.statistics AS actual
      ON actual.table_schema = DATABASE()
      AND actual.table_name = 'Booking'
      AND actual.index_name = 'idx_booking_availability'
      AND actual.non_unique = 1
      AND actual.seq_in_index = expected.seq_in_index
      AND actual.column_name = expected.column_name
    WHERE actual.index_name IS NULL
  `)
]);

export async function runPreflight(pool, { resumeAfter = 0 } = {}) {
  if (![0, 2].includes(resumeAfter)) {
    throw new Error("Preflight currently supports a clean start or resume after B-02");
  }

  const checks = [];

  for (const item of PREFLIGHT_CHECKS) {
    const [rows] = await pool.query(item.sql);
    const observedCount = Number(rows[0]?.blocking_count ?? 0);
    if (!Number.isFinite(observedCount) || observedCount < 0) {
      throw new Error(`Invalid preflight result for ${item.key}`);
    }
    const expectedCount = expectedExistingCount(item.key, resumeAfter);
    const count = expectedCount === null
      ? observedCount
      : Math.abs(observedCount - expectedCount);
    checks.push({ key: item.key, count, observedCount, expectedCount });
  }

  if (resumeAfter === 2) {
    for (const item of RESUME_AFTER_B02_CHECKS) {
      const [rows] = await pool.query(item.sql);
      const count = Number(rows[0]?.blocking_count ?? 0);
      if (!Number.isFinite(count) || count < 0) {
        throw new Error(`Invalid preflight result for ${item.key}`);
      }
      checks.push({ key: item.key, count, observedCount: count, expectedCount: 0 });
    }
  }

  const blockingCount = checks.reduce((sum, item) => sum + item.count, 0);
  return { ok: blockingCount === 0, resumeAfter, blockingCount, checks };
}

export function summarizePreflight(result) {
  const status = result.ok ? "PASS" : "BLOCKED";
  const details = result.checks
    .map((item) => `${item.key}: ${item.count}`)
    .join("\n");
  return `Plan B preflight: ${status}\n${details}`;
}

function check(key, sql) {
  return Object.freeze({
    key,
    sql: `/* preflight:${key} */${sql}`
  });
}

function expectedExistingCount(key, resumeAfter) {
  if (key === "existing-plan-b-tables") return 0;
  if (key === "existing-plan-b-columns") return resumeAfter === 2 ? 2 : 0;
  return null;
}

async function main() {
  if (process.env.DB_NAME !== "tkc_hotel_dev") {
    throw new Error("Plan B preflight target must be tkc_hotel_dev");
  }

  const resumeArgument = process.argv.find((value) => value.startsWith("--resume-after="));
  const resumeAfter = resumeArgument ? Number(resumeArgument.split("=")[1]) : 0;
  const pool = createDatabasePool();
  try {
    if (await detectCompletedMigration(pool)) {
      console.log(JSON.stringify({ ok: true, state: "MIGRATED", tables: 19 }, null, 2));
      console.error("Plan B preflight: PASS (migration already complete)");
      return;
    }
    const result = await runPreflight(pool, { resumeAfter });
    console.log(JSON.stringify(result, null, 2));
    console.error(summarizePreflight(result));
    if (!result.ok) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

