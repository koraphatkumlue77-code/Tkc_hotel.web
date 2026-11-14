import { pool, withTransaction } from "./db.js";
import { nightsBetween } from "./pricing.js";
import { asyncRoute, fail } from "./errors.js";
import { requireRole } from "./auth.js";
import { recordAudit } from "./audit.js";

export const overlaps = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

export async function getAvailability(
  connection,
  { checkIn, checkOut, guests = 1 },
) {
  nightsBetween(checkIn, checkOut);
  if (!Number.isInteger(Number(guests)) || Number(guests) < 1)
    fail(400, "จำนวนผู้เข้าพักไม่ถูกต้อง");
  const [types] = await connection.query(
    "SELECT id, name, capacity, nightly_price AS nightlyPrice, breakfast_price AS breakfastPrice, description, image_url AS imageUrl FROM room_types WHERE active=1 ORDER BY id",
  );
  const [totals] = await connection.query(
    "SELECT type_id, COUNT(*) AS total FROM rooms GROUP BY type_id",
  );
  const [booked] = await connection.execute(
    `SELECT br.type_id, COUNT(*) AS amount FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE b.check_in < ? AND ? < b.check_out AND (b.status IN ('confirmed','checked_in','replacement_pending') OR (b.status IN ('held','pending_review') AND (b.status='pending_review' OR b.hold_until > NOW()))) GROUP BY br.type_id`,
    [checkOut, checkIn],
  );
  const [closed] = await connection.execute(
    "SELECT r.type_id, COUNT(DISTINCT r.id) AS amount FROM repair_closures c JOIN rooms r ON r.id=c.room_id WHERE c.opened_at IS NULL AND c.from_date < ? AND ? < c.to_date GROUP BY r.type_id",
    [checkOut, checkIn],
  );
  const map = (rows) =>
    new Map(
      rows.map((row) => [Number(row.type_id), Number(row.amount ?? row.total)]),
    );
  const totalMap = map(totals),
    bookedMap = map(booked),
    closedMap = map(closed);
  return types.map((type) => ({
    ...type,
    total: totalMap.get(type.id) || 0,
    available: Math.max(
      0,
      (totalMap.get(type.id) || 0) -
        (bookedMap.get(type.id) || 0) -
        (closedMap.get(type.id) || 0),
    ),
    fitsGuests: Number(type.capacity) >= Number(guests),
  }));
}

export function roomRoutes(app) {
  app.get(
    "/api/rooms/types",
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT id,name,capacity,nightly_price AS nightlyPrice,breakfast_price AS breakfastPrice,description,image_url AS imageUrl FROM room_types WHERE active=1 ORDER BY id",
      );
      res.json(rows);
    }),
  );
  app.get(
    "/api/rooms/availability",
    asyncRoute(async (req, res) =>
      res.json(await getAvailability(pool, req.query)),
    ),
  );
  app.get(
    "/api/rooms/:id/history",
    requireRole("superadmin", "reception", "management", "housekeeping"),
    asyncRoute(async (req, res) => {
      const [rows] = await pool.execute(
        "SELECT b.id AS bookingId,b.check_in AS checkIn,b.check_out AS checkOut,b.status FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.room_id=? ORDER BY b.check_in DESC LIMIT 50",
        [req.params.id],
      );
      const [cleaning] = await pool.execute(
        "SELECT * FROM cleaning_tasks WHERE room_id=? ORDER BY id DESC LIMIT 20",
        [req.params.id],
      );
      const [damage] = await pool.execute(
        "SELECT id,details,created_at FROM damage_reports WHERE room_id=? ORDER BY id DESC LIMIT 20",
        [req.params.id],
      );
      res.json({ bookings: rows, cleaning, damage });
    }),
  );
  app.get(
    "/api/rooms",
    requireRole("superadmin", "reception", "management", "housekeeping"),
    asyncRoute(async (req, res) => {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const code =
        typeof req.query.code === "string" ? req.query.code.trim() : "";
      const [rows] = code
        ? await pool.execute(
            "SELECT r.id,r.code,r.type_id AS typeId,t.name AS typeName,r.status,r.area_sqm AS areaSqm FROM rooms r JOIN room_types t ON t.id=r.type_id WHERE r.code LIKE ? ORDER BY r.id LIMIT ?",
            [`%${code}%`, limit],
          )
        : await pool.execute(
            "SELECT r.id,r.code,r.type_id AS typeId,t.name AS typeName,r.status,r.area_sqm AS areaSqm FROM rooms r JOIN room_types t ON t.id=r.type_id ORDER BY r.id LIMIT ? OFFSET ?",
            [limit, offset],
          );
      res.json(rows);
    }),
  );
  app.post(
    "/api/rooms/types",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      const {
        name,
        capacity,
        nightlyPrice,
        breakfastPrice,
        description = "",
      } = req.body;
      if (
        !name ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        !Number.isInteger(nightlyPrice) ||
        nightlyPrice < 0 ||
        !Number.isInteger(breakfastPrice) ||
        breakfastPrice < 0
      )
        fail(400, "ข้อมูลประเภทห้องไม่ถูกต้อง");
      const id = await withTransaction(async (connection) => {
        const [[next]] = await connection.query(
          "SELECT COALESCE(MAX(id),0)+1 AS id FROM room_types",
        );
        await connection.execute(
          "INSERT INTO room_types (id,name,capacity,nightly_price,breakfast_price,description) VALUES (?,?,?,?,?,?)",
          [next.id, name, capacity, nightlyPrice, breakfastPrice, description],
        );
        await recordAudit(connection, {
          actorId: req.session.accountId,
          action: "create",
          entity: "room_type",
          entityId: next.id,
          after: req.body,
        });
        return next.id;
      });
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/rooms/types/:id",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      const allowed = [
        "name",
        "capacity",
        "nightlyPrice",
        "breakfastPrice",
        "description",
        "active",
      ];
      const keys = Object.keys(req.body).filter((k) => allowed.includes(k));
      if (!keys.length) fail(400, "ไม่มีข้อมูลให้แก้ไข");
      const columns = {
        nightlyPrice: "nightly_price",
        breakfastPrice: "breakfast_price",
      };
      await withTransaction(async (connection) => {
        const [[before]] = await connection.execute(
          "SELECT * FROM room_types WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!before) fail(404, "ไม่พบประเภทห้อง");
        await connection.execute(
          `UPDATE room_types SET ${keys.map((k) => `${columns[k] || k}=?`).join(",")} WHERE id=?`,
          [...keys.map((k) => req.body[k]), req.params.id],
        );
        await recordAudit(connection, {
          actorId: req.session.accountId,
          action: "update",
          entity: "room_type",
          entityId: req.params.id,
          before,
          after: req.body,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/rooms",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      const { typeId, code, areaSqm } = req.body;
      if (!Number.isInteger(typeId) || !/^[A-Za-z]{3}\d{3}$/.test(code || ""))
        fail(400, "ข้อมูลห้องไม่ถูกต้อง");
      const id = await withTransaction(async (connection) => {
        const [result] = await connection.execute(
          "INSERT INTO rooms (type_id,code,area_sqm) VALUES (?,?,?)",
          [typeId, code, areaSqm || null],
        );
        await recordAudit(connection, {
          actorId: req.session.accountId,
          action: "create",
          entity: "room",
          entityId: result.insertId,
          after: req.body,
        });
        return result.insertId;
      });
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/rooms/:id",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      const { code, areaSqm } = req.body;
      if (!code && areaSqm === undefined) fail(400, "ไม่มีข้อมูลให้แก้ไข");
      await withTransaction(async (connection) => {
        const [[before]] = await connection.execute(
          "SELECT * FROM rooms WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!before) fail(404, "ไม่พบห้อง");
        await connection.execute(
          "UPDATE rooms SET code=?,area_sqm=? WHERE id=?",
          [code || before.code, areaSqm ?? before.area_sqm, req.params.id],
        );
        await recordAudit(connection, {
          actorId: req.session.accountId,
          action: "update",
          entity: "room",
          entityId: req.params.id,
          before,
          after: req.body,
        });
      });
      res.json({ ok: true });
    }),
  );
}
