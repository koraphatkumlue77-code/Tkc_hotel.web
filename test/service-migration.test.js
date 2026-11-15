import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pool } from "../server/db.js";
import { migrate } from "../db/migrate.js";
import { seed } from "../db/seed.js";
import { resetTestDatabase } from "./reset.js";

test("006 upgrades existing service IDs, preserves ambiguous ownership, and safely retries", async () => {
  await resetTestDatabase();
  try {
    // Build an actual pre-006 schema, then mark 006 temporarily to seed it.
    for (const name of [
      "001_core.sql",
      "002_service_room_link.sql",
      "003_review_owner_normalization.sql",
      "004_payment_channel.sql",
      "005_service_integrity.sql",
    ]) {
      const sql = await readFile(
        new URL(`../db/migrations/${name}`, import.meta.url),
        "utf8",
      );
      for (const statement of sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((x) => x.trim())
        .filter(Boolean))
        await pool.query(statement);
      await pool.execute("INSERT INTO migrations (name) VALUES (?)", [name]);
    }
    await pool.execute(
      "INSERT INTO migrations (name) VALUES ('006_service_room_normalization.sql')",
    );
    await seed();
    const [customer] = await pool.execute(
      "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
      ["Migration Guest", "000", "MIGRATION"],
    );
    const [booking] = await pool.execute(
      "INSERT INTO bookings (customer_id,source,check_in,check_out,guests,status,total,room_subtotal,service_subtotal,deposit_due,price_snapshot) VALUES (?,'walk_in','2027-01-01','2027-01-02',1,'confirmed',1000,1000,0,200,'{}')",
      [customer.insertId],
    );
    const [room] = await pool.execute(
      "INSERT INTO booking_rooms (booking_id,type_id,guests,nightly_price) VALUES (?,1,1,1000)",
      [booking.insertId],
    );
    const [linked] = await pool.execute(
      "INSERT INTO booking_services (booking_id,booking_room_id,kind,quantity,unit_price,total) VALUES (?,?,'fitness',1,500,500)",
      [booking.insertId, room.insertId],
    );
    const [ambiguous] = await pool.execute(
      "INSERT INTO booking_services (booking_id,booking_room_id,kind,quantity,unit_price,total) VALUES (?,NULL,'breakfast',1,350,350)",
      [booking.insertId],
    );
    const [tour] = await pool.execute(
      "INSERT INTO booking_services (booking_id,booking_room_id,kind,quantity,unit_price,total) VALUES (?,NULL,'tour',1,0,50)",
      [booking.insertId],
    );
    await pool.execute(
      "DELETE FROM migrations WHERE name='006_service_room_normalization.sql'",
    );
    await Promise.all([migrate(), migrate()]);
    const [services] = await pool.execute(
      "SELECT s.id,s.kind,s.total,l.booking_room_id FROM booking_services s LEFT JOIN booking_service_rooms l ON l.service_id=s.id WHERE s.booking_id=? ORDER BY s.id",
      [booking.insertId],
    );
    assert.deepEqual(services, [
      {
        id: linked.insertId,
        kind: "fitness",
        total: 500,
        booking_room_id: room.insertId,
      },
      {
        id: ambiguous.insertId,
        kind: "breakfast",
        total: 350,
        booking_room_id: null,
      },
      { id: tour.insertId, kind: "tour", total: 50, booking_room_id: null },
    ]);
    const [[column]] = await pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='booking_services' AND column_name='booking_room_id'",
    );
    assert.equal(column.n, 0);
    // Re-run the interrupted-migration path after DDL committed but before recording.
    await pool.execute(
      "DELETE FROM migrations WHERE name='006_service_room_normalization.sql'",
    );
    await migrate();
    const [[again]] = await pool.execute(
      "SELECT booking_room_id FROM booking_service_rooms WHERE service_id=?",
      [linked.insertId],
    );
    assert.equal(again.booking_room_id, room.insertId);
    const rollback = await readFile(
      new URL(
        "../db/rollbacks/006_service_room_normalization.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of rollback
      .split(/;\s*(?:\r?\n|$)/)
      .map((x) => x.trim())
      .filter(Boolean))
      await pool.query(statement);
    const [[restored]] = await pool.execute(
      "SELECT booking_room_id FROM booking_services WHERE id=?",
      [linked.insertId],
    );
    assert.equal(restored.booking_room_id, room.insertId);
    const [[stillUnassigned]] = await pool.execute(
      "SELECT booking_room_id FROM booking_services WHERE id=?",
      [ambiguous.insertId],
    );
    assert.equal(stillUnassigned.booking_room_id, null);
    await migrate();
    const [[upgradedAgain]] = await pool.execute(
      "SELECT booking_room_id FROM booking_service_rooms WHERE service_id=?",
      [linked.insertId],
    );
    assert.equal(upgradedAgain.booking_room_id, room.insertId);
  } finally {
    await pool.end();
  }
});
