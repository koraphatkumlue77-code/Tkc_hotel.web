import { pool, withTransaction } from "./db.js";
import {
  createBookingHold,
  setBookingStatus,
  bookingDetail,
} from "./bookings.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

function bangkok(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export async function assignRoom(
  connection,
  { bookingRoomId, roomId, actorId, approvedBy = null, reason = null },
) {
  const [[item]] = await connection.execute(
    "SELECT br.*,b.status,b.check_in,b.check_out FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.id=? FOR UPDATE",
    [bookingRoomId],
  );
  if (!item) fail(404, "ไม่พบรายการห้องจอง");
  if (!["confirmed", "checked_in", "replacement_pending"].includes(item.status))
    fail(409, "ต้องรอบัญชียืนยันก่อนจัดห้อง");
  if (item.status === "checked_in" && !approvedBy)
    fail(409, "การย้ายหลังเข้าพักต้องได้รับอนุมัติฝ่ายบริหาร");
  const [[room]] = await connection.execute(
    "SELECT r.*,t.capacity FROM rooms r JOIN room_types t ON t.id=r.type_id WHERE r.id=? FOR UPDATE",
    [roomId],
  );
  if (
    !room ||
    Number(room.type_id) !== Number(item.type_id) ||
    Number(room.capacity) < Number(item.guests)
  )
    fail(409, "ห้องไม่ตรงประเภทหรือความจุ");
  if (
    room.status === "repair" ||
    (item.status === "checked_in" && room.status !== "ready")
  )
    fail(409, "ห้องไม่พร้อม");
  const [[closure]] = await connection.execute(
    "SELECT COUNT(*) AS amount FROM repair_closures WHERE room_id=? AND opened_at IS NULL AND from_date<? AND ?<to_date",
    [roomId, item.check_out, item.check_in],
  );
  if (closure.amount) fail(409, "ห้องปิดซ่อมในช่วงเข้าพัก");
  const [[conflict]] = await connection.execute(
    "SELECT COUNT(*) AS amount FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.room_id=? AND br.id<>? AND b.check_in<? AND ?<b.check_out AND b.status IN ('confirmed','checked_in','replacement_pending')",
    [roomId, bookingRoomId, item.check_out, item.check_in],
  );
  if (conflict.amount) fail(409, "ห้องนี้ถูกจัดให้การจองอื่นแล้ว");
  await connection.execute("UPDATE booking_rooms SET room_id=? WHERE id=?", [
    roomId,
    bookingRoomId,
  ]);
  await connection.execute(
    "INSERT INTO room_assignments (booking_room_id,old_room_id,new_room_id,assigned_by,approved_by,reason) VALUES (?,?,?,?,?,?)",
    [bookingRoomId, item.room_id, roomId, actorId, approvedBy, reason],
  );
  await recordAudit(connection, {
    actorId,
    action: "assign",
    entity: "booking_room",
    entityId: bookingRoomId,
    before: { roomId: item.room_id },
    after: { roomId },
    reason,
  });
}

export async function checkIn(
  connection,
  { bookingId, actorId, now = new Date() },
) {
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [bookingId],
  );
  if (!booking || booking.status !== "confirmed") fail(409, "การจองยังไม่ยืนยัน");
  const local = bangkok(now);
  if (
    local.date < booking.check_in ||
    (local.date === booking.check_in && local.minutes < 14 * 60) ||
    local.date >= booking.check_out
  )
    fail(409, "ยังไม่ถึงเวลาเข้าพัก");
  const [[paid]] = await connection.execute(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE booking_id=? AND status='approved'",
    [bookingId],
  );
  if (Number(paid.amount) < Number(booking.total))
    fail(409, "ยังชำระก่อนเข้าพักไม่ครบ");
  const [rooms] = await connection.execute(
    "SELECT br.id,br.room_id,r.status FROM booking_rooms br LEFT JOIN rooms r ON r.id=br.room_id WHERE br.booking_id=? FOR UPDATE",
    [bookingId],
  );
  if (
    !rooms.length ||
    rooms.some((room) => !room.room_id || room.status !== "ready")
  )
    fail(409, "ห้องยังไม่พร้อมเข้าพัก");
  for (const room of rooms) {
    const [[closed]] = await connection.execute(
      "SELECT COUNT(*) AS amount FROM repair_closures WHERE room_id=? AND opened_at IS NULL AND from_date<=? AND ?<to_date",
      [room.room_id, local.date, local.date],
    );
    if (closed.amount) fail(409, "มีห้องปิดซ่อม");
    await connection.execute("UPDATE rooms SET status='occupied' WHERE id=?", [
      room.room_id,
    ]);
  }
  await connection.execute(
    "UPDATE tour_participants SET status='confirmed' WHERE booking_id=? AND status='held'",
    [bookingId],
  );
  await setBookingStatus(
    connection,
    bookingId,
    "confirmed",
    "checked_in",
    actorId,
    "Check-in",
  );
}

export async function checkOut(
  connection,
  { bookingId, actorId, now = new Date() },
) {
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [bookingId],
  );
  if (!booking || booking.status !== "checked_in")
    fail(409, "การจองยังไม่ได้ Check-in");
  const local = bangkok(now);
  if (
    local.date < booking.check_out ||
    (local.date === booking.check_out && local.minutes >= 12 * 60)
  )
    fail(409, "Check-out ต้องก่อน 12:00 น. ของวันออก");
  const [rooms] = await connection.execute(
    "SELECT room_id FROM booking_rooms WHERE booking_id=?",
    [bookingId],
  );
  for (const item of rooms) {
    if (!item.room_id) continue;
    await connection.execute("UPDATE rooms SET status='dirty' WHERE id=?", [
      item.room_id,
    ]);
    await connection.execute(
      "INSERT INTO cleaning_tasks (room_id,booking_id,status) VALUES (?,?,?)",
      [item.room_id, bookingId, "pending"],
    );
    await recordAudit(connection, {
      actorId,
      action: "checkout_dirty",
      entity: "room",
      entityId: item.room_id,
      after: { status: "dirty" },
    });
  }
  await setBookingStatus(
    connection,
    bookingId,
    "checked_in",
    "checked_out",
    actorId,
    "Check-out",
  );
}

export function stayRoutes(app) {
  app.post(
    "/api/bookings/:id/assignments",
    requireRole("superadmin", "reception"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (req.session.role === "reception" && detail.source !== "walk_in")
        fail(403, "ฝ่ายต้อนรับจัดห้อง Walk-in เท่านั้น");
      await withTransaction((c) =>
        assignRoom(c, {
          bookingRoomId: req.body.bookingRoomId,
          roomId: req.body.roomId,
          actorId: req.session.accountId,
          reason: req.body.reason,
        }),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/bookings/:id/check-in",
    requireRole("reception"),
    asyncRoute(async (req, res) => {
      await withTransaction((c) =>
        checkIn(c, {
          bookingId: req.params.id,
          actorId: req.session.accountId,
        }),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/bookings/:id/check-out",
    requireRole("reception"),
    asyncRoute(async (req, res) => {
      await withTransaction((c) =>
        checkOut(c, {
          bookingId: req.params.id,
          actorId: req.session.accountId,
        }),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/walk-ins",
    requireRole("reception"),
    asyncRoute(async (req, res) => {
      const { fullName, phone, identityReference, rooms, checkIn, checkOut } =
        req.body;
      if (
        ![fullName, phone, identityReference].every(
          (x) => typeof x === "string" && x.trim(),
        )
      )
        fail(400, "ข้อมูลผู้จองไม่ครบ");
      const result = await withTransaction(async (c) => {
        const [customer] = await c.execute(
          "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
          [fullName, phone, identityReference],
        );
        const booking = await createBookingHold(c, {
          customerId: customer.insertId,
          rooms,
          checkIn,
          checkOut,
          services: req.body.services || {},
          source: "walk_in",
        });
        await c.execute(
          "INSERT INTO payments (booking_id,amount,method,status,auto_check,reviewed_at,reviewed_by) VALUES (?,?,'reception_demo','approved','Walk-in full simulated payment',NOW(),?)",
          [booking.id, booking.total, req.session.accountId],
        );
        await setBookingStatus(
          c,
          booking.id,
          "held",
          "confirmed",
          req.session.accountId,
          "Walk-in ชำระเต็มจำลอง",
        );
        return booking;
      });
      res.status(201).json(result);
    }),
  );
  app.post(
    "/api/bookings/:id/late-arrival",
    requireRole("member", "reception"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (
        req.session.role === "member" &&
        Number(detail.account_id) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์");
      if (
        !req.body.expectedAt ||
        !Number.isFinite(Date.parse(req.body.expectedAt))
      )
        fail(400, "เวลาไม่ถูกต้อง");
      await withTransaction(async (c) => {
        await c.execute("UPDATE bookings SET late_arrival_at=? WHERE id=?", [
          new Date(req.body.expectedAt),
          req.params.id,
        ]);
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "late_arrival",
          entity: "booking",
          entityId: req.params.id,
          after: { expectedAt: req.body.expectedAt },
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/bookings/:id/late-arrival-contact",
    requireRole("reception"),
    asyncRoute(async (req, res) => {
      if (!req.body.outcome?.trim()) fail(400, "กรุณาบันทึกผลการติดต่อ");
      await withTransaction(async (c) => {
        await c.execute(
          "UPDATE bookings SET late_arrival_contact=? WHERE id=?",
          [req.body.outcome, req.params.id],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "late_contact",
          entity: "booking",
          entityId: req.params.id,
          after: { outcome: req.body.outcome },
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/bookings/:id/no-show",
    requireRole("reception"),
    asyncRoute(async (req, res) => {
      await withTransaction(async (c) => {
        const [[b]] = await c.execute(
          "SELECT * FROM bookings WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!b || b.status !== "confirmed" || b.late_arrival_at)
          fail(409, "ไม่เข้าเงื่อนไข No-show");
        const local = bangkok(new Date());
        const next = new Date(`${b.check_in}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        if (
          `${local.date}T${String(Math.floor(local.minutes / 60)).padStart(2, "0")}` <
          `${next.toISOString().slice(0, 10)}T06`
        )
          fail(409, "ยังไม่ถึงเวลา No-show");
        await setBookingStatus(
          c,
          b.id,
          "confirmed",
          "no_show",
          req.session.accountId,
          "ไม่มาภายใน 06:00 วันถัดไป",
        );
      });
      res.json({ ok: true });
    }),
  );
}
