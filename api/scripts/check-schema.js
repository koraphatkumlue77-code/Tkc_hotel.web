export const EXPECTED_TABLES = Object.freeze([
  "AuditLog",
  "Booking",
  "BookingPromotion",
  "BookingRoom",
  "BookingService",
  "ChatMessage",
  "Customer",
  "Employee",
  "Payment",
  "Promotion",
  "Review",
  "Room",
  "RoomAssignment",
  "RoomEvent",
  "RoomType",
  "Service",
  "ServiceUsage",
  "TourReservation",
  "TourRound"
]);

export function checkSchemaSql(sqlText) {
  const tables = Array.from(
    sqlText.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?[A-Za-z0-9_]+`?\.)?`?([A-Za-z0-9_]+)`?/gi
    ),
    (match) => match[1]
  ).sort();
  const uniqueTables = [...new Set(tables)];
  const planBMarkers = Array.from(
    sqlText.matchAll(/\[PLAN B-(\d{2})\]/g),
    (match) => match[1]
  );
  const errors = [];

  const missingTables = EXPECTED_TABLES.filter(
    (tableName) => !uniqueTables.includes(tableName)
  );
  const unexpectedTables = uniqueTables.filter(
    (tableName) => !EXPECTED_TABLES.includes(tableName)
  );

  if (missingTables.length > 0) {
    errors.push(`missing tables: ${missingTables.join(", ")}`);
  }
  if (unexpectedTables.length > 0) {
    errors.push(`unexpected tables: ${unexpectedTables.join(", ")}`);
  }

  for (let marker = 1; marker <= 14; marker += 1) {
    const value = String(marker).padStart(2, "0");
    if (!planBMarkers.includes(value)) {
      errors.push(`missing migration marker: PLAN B-${value}`);
    }
  }

  if (!/PLAN B POSTCHECK \(READ ONLY\)/.test(sqlText)) {
    errors.push("missing PLAN B POSTCHECK");
  }

  if (
    /CREATE\s+USER/i.test(sqlText) ||
    /IDENTIFIED\s+BY/i.test(sqlText) ||
    /DB_PASSWORD\s*=/i.test(sqlText)
  ) {
    errors.push("embedded credential statement detected");
  }

  if (/ORDER\s+BY[^;]*;\s*ORDER\s+BY/i.test(sqlText)) {
    errors.push("duplicate ORDER BY clause detected");
  }

  return {
    errors,
    tables: uniqueTables,
    planBMarkers: [...new Set(planBMarkers)].sort()
  };
}
