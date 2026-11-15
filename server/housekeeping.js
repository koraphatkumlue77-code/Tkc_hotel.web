import { pool, withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";
import { setBookingStatus, bookingDetail } from "./bookings.js";
import { assignRoom } from "./stays.js";
import { nightsBetween } from "./pricing.js";

export async function startCleaning(
  connection,
  { taskId, employeeId, now = new Date() },
) {
  const [[task]] = await connection.execute(
    "SELECT * FROM cleaning_tasks WHERE id=? FOR UPDATE",
    [taskId],
  );
  if (!task || task.status !== "pending") fail(409, "งานนี้เริ่มไม่ได้");
  await connection.execute(
    "UPDATE cleaning_tasks SET status='working',employee_id=?,started_at=? WHERE id=?",
    [employeeId, now, taskId],
  );
  await recordAudit(connection, {
    actorId: employeeId,
    action: "start",
    entity: "cleaning_task",
    entityId: taskId,
    before: { status: "pending" },
    after: { status: "working" },
  });
}

export async function finishCleaning(
  connection,
  { taskId, employeeId, now = new Date() },
) {
  const [[task]] = await connection.execute(
    "SELECT * FROM cleaning_tasks WHERE id=? FOR UPDATE",
    [taskId],
  );
  if (
    !task ||
    task.status !== "working" ||
    Number(task.employee_id) !== Number(employeeId)
  )
    fail(409, "งานนี้ยืนยันเสร็จไม่ได้");
  await connection.execute(
    "UPDATE cleaning_tasks SET status='done',finished_at=? WHERE id=?",
    [now, taskId],
  );
  const [[room]] = await connection.execute(
    "SELECT status FROM rooms WHERE id=? FOR UPDATE",
    [task.room_id],
  );
  if (room.status === "dirty")
    await connection.execute("UPDATE rooms SET status='ready' WHERE id=?", [
      task.room_id,
    ]);
  await recordAudit(connection, {
    actorId: employeeId,
    action: "finish",
    entity: "cleaning_task",
    entityId: taskId,
    before: { status: "working" },
    after: {
      status: "done",
      roomStatus: room.status === "dirty" ? "ready" : room.status,
    },
  });
}

export async function proposeReplacement(
  connection,
  { bookingRoomId, roomId, actorId },
) {
  const [[item]] = await connection.execute(
    "SELECT br.*,b.check_in,b.check_out,b.status FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.id=? FOR UPDATE",
    [bookingRoomId],
  );
  if (!item || !["confirmed", "replacement_pending"].includes(item.status))
    fail(409, "ไม่สามารถเสนอห้องแทน");
  const [[room]] = await connection.execute(
    "SELECT r.*,t.capacity FROM rooms r JOIN room_types t ON t.id=r.type_id WHERE r.id=? FOR UPDATE",
    [roomId],
  );
  if (
    !room ||
    Number(room.type_id) !== Number(item.type_id) ||
    Number(room.capacity) < Number(item.guests) ||
    room.status === "repair"
  )
    fail(409, "ห้องทดแทนไม่เหมาะสม");
  const [[blocked]] = await connection.execute(
    "SELECT COUNT(*) AS amount FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.room_id=? AND br.id<>? AND b.check_in<? AND ?<b.check_out AND b.status IN ('confirmed','checked_in','replacement_pending')",
    [roomId, bookingRoomId, item.check_out, item.check_in],
  );
  const [[repair]] = await connection.execute(
    "SELECT COUNT(*) AS amount FROM repair_closures WHERE room_id=? AND opened_at IS NULL AND from_date<? AND ?<to_date",
    [roomId, item.check_out, item.check_in],
  );
  if (blocked.amount || repair.amount) fail(409, "ห้องทดแทนไม่ว่าง");
  const [result] = await connection.execute(
    "INSERT INTO replacement_proposals (booking_room_id,proposed_room_id,proposed_by) VALUES (?,?,?)",
    [bookingRoomId, roomId, actorId],
  );
  if (item.status === "confirmed")
    await setBookingStatus(
      connection,
      item.booking_id,
      "confirmed",
      "replacement_pending",
      actorId,
      "รอคำตอบห้องทดแทน",
    );
  await recordAudit(connection, {
    actorId,
    action: "propose",
    entity: "replacement",
    entityId: result.insertId,
    after: { bookingRoomId, roomId },
  });
  return result.insertId;
}

export async function closeRoomForRepair(
  connection,
  { roomId, managerId, from, to, reason },
) {
  nightsBetween(from, to);
  if (!reason?.trim()) fail(400, "กรุณาระบุเหตุผล");
  const [[room]] = await connection.execute(
    "SELECT * FROM rooms WHERE id=? FOR UPDATE",
    [roomId],
  );
  if (!room) fail(404, "ไม่พบห้อง");
  const [result] = await connection.execute(
    "INSERT INTO repair_closures (room_id,from_date,to_date,reason,closed_by) VALUES (?,?,?,?,?)",
    [roomId, from, to, reason, managerId],
  );
  await connection.execute("UPDATE rooms SET status='repair' WHERE id=?", [
    roomId,
  ]);
  const [affected] = await connection.execute(
    "SELECT br.id,br.booking_id,b.status FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.room_id=? AND b.check_in<? AND ?<b.check_out AND b.status IN ('confirmed','checked_in')",
    [roomId, to, from],
  );
  for (const item of affected) {
    if (item.status === "confirmed")
      await setBookingStatus(
        connection,
        item.booking_id,
        "confirmed",
        "replacement_pending",
        managerId,
        "ห้องปิดซ่อม ต้องเสนอห้องแทน",
      );
    const [candidates] = await connection.execute(
      "SELECT r.id FROM rooms r WHERE r.type_id=? AND r.id<>? AND r.status='ready' AND NOT EXISTS (SELECT 1 FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.room_id=r.id AND b.check_in<? AND ?<b.check_out AND b.status IN ('confirmed','checked_in','replacement_pending')) AND NOT EXISTS (SELECT 1 FROM repair_closures c WHERE c.room_id=r.id AND c.opened_at IS NULL AND c.from_date<? AND ?<c.to_date) ORDER BY r.id LIMIT 1",
      [room.type_id, roomId, to, from, to, from],
    );
    if (candidates.length && item.status === "confirmed")
      await proposeReplacement(connection, {
        bookingRoomId: item.id,
        roomId: candidates[0].id,
        actorId: managerId,
      });
  }
  await recordAudit(connection, {
    actorId: managerId,
    action: "close",
    entity: "room",
    entityId: roomId,
    before: { status: room.status },
    after: { status: "repair", from, to },
    reason,
  });
  return result.insertId;
}

export function housekeepingRoutes(app) {
  app.get(
    "/api/housekeeping/tasks",
    requireRole("housekeeping", "reception", "management"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT t.*,r.code FROM cleaning_tasks t JOIN rooms r ON r.id=t.room_id ORDER BY FIELD(t.status,'pending','working','done'),t.id DESC LIMIT 100",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/housekeeping/tasks/:id/start",
    requireRole("housekeeping"),
    asyncRoute(async (req, res) => {
      await withTransaction((c) =>
        startCleaning(c, {
          taskId: req.params.id,
          employeeId: req.session.accountId,
        }),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/housekeeping/tasks/:id/finish",
    requireRole("housekeeping"),
    asyncRoute(async (req, res) => {
      await withTransaction((c) =>
        finishCleaning(c, {
          taskId: req.params.id,
          employeeId: req.session.accountId,
        }),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/damage-reports",
    requireRole("housekeeping"),
    asyncRoute(async (req, res) => {
      if (
        !req.body.details?.trim() ||
        !req.body.imagePath?.startsWith("uploads/")
      )
        fail(400, "ต้องมีรายละเอียดและรูปตัวอย่าง");
      const id = await withTransaction(async (c) => {
        const [result] = await c.execute(
          "INSERT INTO damage_reports (room_id,booking_id,reporter_id,details,image_path) VALUES (?,?,?,?,?)",
          [
            req.body.roomId,
            req.body.bookingId || null,
            req.session.accountId,
            req.body.details,
            req.body.imagePath,
          ],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "report",
          entity: "damage",
          entityId: result.insertId,
          after: req.body,
        });
        return result.insertId;
      });
      res.status(201).json({ id });
    }),
  );
  app.get(
    "/api/damage-reports",
    requireRole("management", "reception", "housekeeping"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT d.*,r.code FROM damage_reports d JOIN rooms r ON r.id=d.room_id ORDER BY d.id DESC LIMIT 100",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/rooms/:id/closures",
    requireRole("management"),
    asyncRoute(async (req, res) => {
      const id = await withTransaction((c) =>
        closeRoomForRepair(c, {
          ...req.body,
          roomId: req.params.id,
          managerId: req.session.accountId,
        }),
      );
      res.status(201).json({ id });
    }),
  );
  app.post(
    "/api/rooms/:id/reopen",
    requireRole("management"),
    asyncRoute(async (req, res) => {
      await withTransaction(async (c) => {
        const [[room]] = await c.execute(
          "SELECT status FROM rooms WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!room || room.status !== "repair") fail(409, "ห้องไม่อยู่ระหว่างซ่อม");
        await c.execute(
          "UPDATE repair_closures SET opened_by=?,opened_at=NOW() WHERE room_id=? AND opened_at IS NULL",
          [req.session.accountId, req.params.id],
        );
        await c.execute("UPDATE rooms SET status='ready' WHERE id=?", [
          req.params.id,
        ]);
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "reopen",
          entity: "room",
          entityId: req.params.id,
          before: { status: "repair" },
          after: { status: "ready" },
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/bookings/:id/replacements",
    requireRole("superadmin", "management"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (
        !detail.rooms.some(
          (room) => Number(room.id) === Number(req.body.bookingRoomId),
        )
      )
        fail(400, "ห้องไม่ได้อยู่ในการจองนี้");
      const id = await withTransaction((c) =>
        proposeReplacement(c, {
          bookingRoomId: req.body.bookingRoomId,
          roomId: req.body.roomId,
          actorId: req.session.accountId,
        }),
      );
      res.status(201).json({ id });
    }),
  );
  app.post(
    "/api/bookings/:id/emergency-move",
    requireRole("management"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (detail.status !== "checked_in") fail(409, "ใช้ได้หลัง Check-in เท่านั้น");
      await withTransaction(async (c) => {
        const [[item]] = await c.execute(
          "SELECT * FROM booking_rooms WHERE id=? AND booking_id=? FOR UPDATE",
          [req.body.bookingRoomId, req.params.id],
        );
        if (!item || !req.body.reason?.trim()) fail(400, "ข้อมูลการย้ายไม่ครบ");
        await assignRoom(c, {
          bookingRoomId: item.id,
          roomId: req.body.roomId,
          actorId: req.session.accountId,
          approvedBy: req.session.accountId,
          reason: req.body.reason,
        });
        await c.execute("UPDATE rooms SET status='dirty' WHERE id=?", [
          item.room_id,
        ]);
        await c.execute("UPDATE rooms SET status='occupied' WHERE id=?", [
          req.body.roomId,
        ]);
      });
      res.json({ ok: true });
    }),
  );
}
