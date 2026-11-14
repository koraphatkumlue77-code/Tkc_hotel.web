import { pool, withTransaction } from "./db.js";
import { bookingDetail } from "./bookings.js";
import { requireRole, requireUser } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export async function ensureTourSlots(connection, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) fail(400, "วันที่ไม่ถูกต้อง");
  for (const time of ["15:00:00", "17:00:00", "19:00:00"])
    await connection.execute(
      "INSERT IGNORE INTO tour_slots (tour_date,time_label,capacity) VALUES (?,?,10)",
      [date, time],
    );
}

export async function priceTourParticipants(
  connection,
  { date, participants },
) {
  const prices = [];
  const seenInRequest = new Set();
  for (const label of participants) {
    const normalized = label.trim();
    const [[row]] = await connection.execute(
      "SELECT COUNT(*) AS uses FROM tour_participants p JOIN tour_slots s ON s.id=p.slot_id WHERE s.tour_date=? AND p.participant_label=? AND p.status<>'cancelled'",
      [date, normalized],
    );
    prices.push(Number(row.uses) || seenInRequest.has(normalized) ? 20 : 50);
    seenInRequest.add(normalized);
  }
  return prices;
}

export async function reserveTourSeats(
  connection,
  { bookingId, slotId, participants, actorId = null },
) {
  if (
    !Array.isArray(participants) ||
    !participants.length ||
    participants.length > 10 ||
    participants.some(
      (x) => typeof x !== "string" || !x.trim() || x.length > 160,
    )
  )
    fail(400, "รายชื่อผู้ร่วมเที่ยวไม่ถูกต้อง");
  const [[slot]] = await connection.execute(
    "SELECT * FROM tour_slots WHERE id=? FOR UPDATE",
    [slotId],
  );
  if (!slot) fail(404, "ไม่พบรอบเที่ยว");
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [bookingId],
  );
  if (
    !booking ||
    !["held", "pending_review", "confirmed", "checked_in"].includes(
      booking.status,
    )
  )
    fail(409, "การจองไม่พร้อมเพิ่มเที่ยว");
  if (
    String(slot.tour_date) < String(booking.check_in) ||
    String(slot.tour_date) >= String(booking.check_out)
  )
    fail(400, "รอบเที่ยวอยู่นอกช่วงเข้าพัก");
  const [[taken]] = await connection.execute(
    "SELECT COUNT(*) AS amount FROM tour_participants WHERE slot_id=? AND status<>'cancelled'",
    [slotId],
  );
  if (Number(taken.amount) + participants.length > Number(slot.capacity))
    fail(409, "รอบเที่ยวเต็ม");
  const prices = await priceTourParticipants(connection, {
    date: slot.tour_date,
    participants,
  });
  for (let i = 0; i < participants.length; i++)
    await connection.execute(
      "INSERT INTO tour_participants (booking_id,slot_id,participant_label,price,status) VALUES (?,?,?,?,?)",
      [
        bookingId,
        slotId,
        participants[i].trim(),
        prices[i],
        booking.status === "checked_in" ? "confirmed" : "held",
      ],
    );
  const charge = prices.reduce((a, b) => a + b, 0);
  await connection.execute(
    "INSERT INTO booking_services (booking_id,kind,service_date,quantity,unit_price,total,created_by) VALUES (?,?,?,?,?,?,?)",
    [
      bookingId,
      "tour",
      slot.tour_date,
      participants.length,
      0,
      charge,
      actorId,
    ],
  );
  await connection.execute(
    "UPDATE bookings SET total=total+?,service_subtotal=service_subtotal+? WHERE id=?",
    [charge, charge, bookingId],
  );
  if (booking.status === "checked_in") {
    await connection.execute(
      "INSERT INTO payments (booking_id,amount,method,status,auto_check,reviewed_at,reviewed_by) VALUES (?,?,'reception_demo','approved','Immediate tour payment (simulated)',NOW(),?)",
      [bookingId, charge, actorId],
    );
  } else {
    await connection.execute(
      "UPDATE bookings SET deposit_due=ROUND(total*IF((SELECT COUNT(*) FROM booking_rooms WHERE booking_id=?)=1,0.2,0.4)) WHERE id=?",
      [bookingId, bookingId],
    );
  }
  await recordAudit(connection, {
    actorId,
    action: "reserve",
    entity: "tour_slot",
    entityId: slotId,
    after: { bookingId, participants, charge },
  });
  return { slotId, bookingId, prices, charge, simulated: true };
}

export function tourRoutes(app) {
  app.get(
    "/api/tours/slots",
    asyncRoute(async (req, res) => {
      await ensureTourSlots(pool, req.query.date);
      const [rows] = await pool.execute(
        "SELECT s.id,s.tour_date AS date,TIME_FORMAT(s.time_label,'%H:%i') AS time,s.capacity,COUNT(p.id) AS taken,s.capacity-COUNT(p.id) AS available FROM tour_slots s LEFT JOIN tour_participants p ON p.slot_id=s.id AND p.status<>'cancelled' WHERE s.tour_date=? GROUP BY s.id ORDER BY s.time_label",
        [req.query.date],
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/tours/reservations",
    requireRole("member", "reception"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.body.bookingId);
      if (
        req.session.role === "member" &&
        Number(detail.account_id) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์เพิ่มเที่ยว");
      if (detail.status === "checked_in" && req.session.role !== "reception")
        fail(403, "กรุณาติดต่อฝ่ายต้อนรับ");
      const result = await withTransaction((c) =>
        reserveTourSeats(c, { ...req.body, actorId: req.session.accountId }),
      );
      res.status(201).json(result);
    }),
  );
  app.post(
    "/api/tours/participants/:id/cancel",
    requireUser,
    asyncRoute(async (req, res) => {
      await withTransaction(async (c) => {
        const [[participant]] = await c.execute(
          "SELECT p.*,b.account_id AS accountId FROM tour_participants p JOIN bookings b ON b.id=p.booking_id WHERE p.id=? FOR UPDATE",
          [req.params.id],
        );
        if (!participant) fail(404, "ไม่พบผู้ร่วมเที่ยว");
        if (
          req.session.role === "member" &&
          Number(participant.accountId) !== Number(req.session.accountId)
        )
          fail(403, "ไม่มีสิทธิ์");
        if (participant.status === "cancelled") fail(409, "ยกเลิกแล้ว");
        await c.execute(
          "UPDATE tour_participants SET status='cancelled' WHERE id=?",
          [req.params.id],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "cancel",
          entity: "tour_participant",
          entityId: req.params.id,
          before: { status: participant.status },
          after: { status: "cancelled" },
          reason: "ไม่คืนค่าบริการเที่ยวจำลอง",
        });
      });
      res.json({ ok: true, refund: 0 });
    }),
  );
}
