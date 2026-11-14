import { pool, withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { bookingDetail, setBookingStatus } from "./bookings.js";
import { assignRoom } from "./stays.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export function calculateRefund({
  reason,
  paid = 0,
  total = 0,
  checkIn,
  now = new Date(),
  serviceAmount = 0,
}) {
  if (reason === "hotel_failure") return Number(paid);
  if (reason === "service_cancel_at_checkin")
    return Math.round(Number(serviceAmount) * 0.8);
  if (
    reason === "tour_cancel" ||
    reason === "no_show" ||
    reason === "service_cancel_late"
  )
    return 0;
  if (reason === "guest_cancel") {
    const checkInTime = new Date(`${checkIn}T07:00:00Z`).getTime();
    if (checkInTime - now.getTime() < 24 * 60 * 60 * 1000) return 0;
    return Math.max(0, Number(paid) - Math.round(Number(total) * 0.2));
  }
  fail(400, "เหตุผลคืนเงินไม่ถูกต้อง");
}

export async function quoteRefund(
  connection,
  { bookingId, reason, now = new Date(), serviceAmount = 0 },
) {
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=?",
    [bookingId],
  );
  if (!booking) fail(404, "ไม่พบการจอง");
  const [[paid]] = await connection.execute(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE booking_id=? AND status='approved'",
    [bookingId],
  );
  return {
    bookingId,
    reason,
    paid: Number(paid.amount),
    amount: calculateRefund({
      reason,
      paid: paid.amount,
      total: booking.total,
      checkIn: booking.check_in,
      now,
      serviceAmount,
    }),
  };
}

export async function requestRefund(
  connection,
  { bookingId, requesterId, reason, now = new Date(), serviceAmount = 0 },
) {
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [bookingId],
  );
  if (
    !booking ||
    ["cancelled", "no_show", "checked_out"].includes(booking.status)
  )
    fail(409, "การจองนี้ยกเลิกไม่ได้");
  const quote = await quoteRefund(connection, {
    bookingId,
    reason,
    now,
    serviceAmount,
  });
  const [result] = await connection.execute(
    "INSERT INTO refunds (booking_id,amount,reason,requested_by) VALUES (?,?,?,?)",
    [bookingId, quote.amount, reason, requesterId],
  );
  if (["guest_cancel", "hotel_failure"].includes(reason)) {
    await setBookingStatus(
      connection,
      bookingId,
      booking.status,
      "cancelled",
      requesterId,
      reason,
    );
    await connection.execute(
      "UPDATE tour_participants SET status='cancelled' WHERE booking_id=? AND status<>'cancelled'",
      [bookingId],
    );
  }
  await recordAudit(connection, {
    actorId: requesterId,
    action: "request",
    entity: "refund",
    entityId: result.insertId,
    after: quote,
    reason,
  });
  return { id: result.insertId, ...quote, status: "requested" };
}

export async function decideRefund(
  connection,
  { requestId, managerId, approved, now = new Date() },
) {
  const [[refund]] = await connection.execute(
    "SELECT * FROM refunds WHERE id=? FOR UPDATE",
    [requestId],
  );
  if (!refund || refund.status !== "requested") fail(409, "คำขอไม่พร้อมพิจารณา");
  const status = approved ? "approved" : "rejected";
  await connection.execute(
    "UPDATE refunds SET status=?,decided_by=?,decided_at=? WHERE id=?",
    [status, managerId, now, requestId],
  );
  await recordAudit(connection, {
    actorId: managerId,
    action: "decide",
    entity: "refund",
    entityId: requestId,
    before: { status: "requested" },
    after: { status },
  });
  return { id: Number(requestId), status };
}

export async function recordRefund(
  connection,
  { requestId, accountantId, now = new Date() },
) {
  const [[refund]] = await connection.execute(
    "SELECT * FROM refunds WHERE id=? FOR UPDATE",
    [requestId],
  );
  if (!refund || refund.status !== "approved")
    fail(409, "ฝ่ายบริหารยังไม่อนุมัติคืนเงิน");
  await connection.execute(
    "UPDATE refunds SET status='recorded',recorded_by=?,recorded_at=? WHERE id=?",
    [accountantId, now, requestId],
  );
  await recordAudit(connection, {
    actorId: accountantId,
    action: "record",
    entity: "refund",
    entityId: requestId,
    before: { status: "approved" },
    after: { status: "recorded", amount: refund.amount },
  });
  return {
    id: Number(requestId),
    amount: refund.amount,
    status: "recorded",
    simulated: true,
  };
}

export function refundRoutes(app) {
  app.post(
    "/api/refunds",
    requireRole("accounting"),
    asyncRoute(async (req, res) => {
      if (!["guest_cancel", "hotel_failure"].includes(req.body.reason))
        fail(400, "เหตุผลไม่ถูกต้อง");
      res
        .status(201)
        .json(
          await withTransaction((c) =>
            requestRefund(c, {
              bookingId: req.body.bookingId,
              requesterId: req.session.accountId,
              reason: req.body.reason,
            }),
          ),
        );
    }),
  );
  app.post(
    "/api/bookings/:id/cancel",
    requireRole("member", "accounting"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (
        req.session.role === "member" &&
        Number(detail.account_id) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์");
      res
        .status(201)
        .json(
          await withTransaction((c) =>
            requestRefund(c, {
              bookingId: req.params.id,
              requesterId: req.session.accountId,
              reason: "guest_cancel",
            }),
          ),
        );
    }),
  );
  app.get(
    "/api/bookings/:id/refund-quote",
    requireRole("member", "accounting", "management"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (
        req.session.role === "member" &&
        Number(detail.account_id) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์");
      res.json(
        await quoteRefund(pool, {
          bookingId: req.params.id,
          reason: req.query.reason || "guest_cancel",
        }),
      );
    }),
  );
  app.get(
    "/api/refunds",
    requireRole("accounting", "management"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT r.*,c.full_name AS customerName FROM refunds r JOIN bookings b ON b.id=r.booking_id JOIN customers c ON c.id=b.customer_id ORDER BY r.id DESC LIMIT 100",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/refunds/:id/decision",
    requireRole("management"),
    asyncRoute(async (req, res) =>
      res.json(
        await withTransaction((c) =>
          decideRefund(c, {
            requestId: req.params.id,
            managerId: req.session.accountId,
            approved: req.body.approved === true,
          }),
        ),
      ),
    ),
  );
  app.post(
    "/api/refunds/:id/record",
    requireRole("accounting"),
    asyncRoute(async (req, res) =>
      res.json(
        await withTransaction((c) =>
          recordRefund(c, {
            requestId: req.params.id,
            accountantId: req.session.accountId,
          }),
        ),
      ),
    ),
  );
  app.post(
    "/api/bookings/:id/replacement-decision",
    requireRole("member"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (Number(detail.account_id) !== Number(req.session.accountId))
        fail(403, "ไม่มีสิทธิ์");
      const result = await withTransaction(async (c) => {
        const [[proposal]] = await c.execute(
          "SELECT p.*,br.booking_id AS bookingId FROM replacement_proposals p JOIN booking_rooms br ON br.id=p.booking_room_id WHERE p.id=? FOR UPDATE",
          [req.body.proposalId],
        );
        if (
          !proposal ||
          Number(proposal.bookingId) !== Number(req.params.id) ||
          proposal.status !== "pending"
        )
          fail(409, "ไม่มีข้อเสนอที่รอตอบ");
        if (req.body.accepted === true) {
          await assignRoom(c, {
            bookingRoomId: proposal.booking_room_id,
            roomId: proposal.proposed_room_id,
            actorId: req.session.accountId,
            reason: "ลูกค้ารับห้องทดแทน",
          });
          await c.execute(
            "UPDATE replacement_proposals SET status='accepted',decided_at=NOW() WHERE id=?",
            [proposal.id],
          );
          const [[pending]] = await c.execute(
            "SELECT COUNT(*) AS amount FROM replacement_proposals p JOIN booking_rooms br ON br.id=p.booking_room_id WHERE br.booking_id=? AND p.status='pending'",
            [req.params.id],
          );
          if (!pending.amount)
            await setBookingStatus(
              c,
              req.params.id,
              "replacement_pending",
              "confirmed",
              req.session.accountId,
              "รับห้องทดแทน",
            );
          return { status: "accepted" };
        }
        await c.execute(
          "UPDATE replacement_proposals SET status='declined',decided_at=NOW() WHERE id=?",
          [proposal.id],
        );
        return requestRefund(c, {
          bookingId: req.params.id,
          requesterId: req.session.accountId,
          reason: "hotel_failure",
        });
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/bookings/:id/services/cancel",
    requireRole("reception"),
    asyncRoute(async (req, res) => {
      if (!["breakfast", "fitness", "sauna"].includes(req.body.kind))
        fail(400, "บริการไม่ถูกต้อง");
      const result = await withTransaction(async (c) => {
        const [[booking]] = await c.execute(
          "SELECT * FROM bookings WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!booking || booking.status !== "checked_in")
          fail(409, "ยกเลิกบริการได้ตอน Check-in");
        const [services] = await c.execute(
          "SELECT * FROM booking_services WHERE booking_id=? AND kind=? AND status='active' FOR UPDATE",
          [req.params.id, req.body.kind],
        );
        if (!services.length) fail(409, "ไม่มีบริการที่เลือก");
        await c.execute(
          "UPDATE booking_services SET status='cancelled' WHERE booking_id=? AND kind=? AND status='active'",
          [req.params.id, req.body.kind],
        );
        const amount = services.reduce((sum, s) => sum + Number(s.total), 0);
        return requestRefund(c, {
          bookingId: req.params.id,
          requesterId: req.session.accountId,
          reason: "service_cancel_at_checkin",
          serviceAmount: amount,
        });
      });
      res.status(201).json(result);
    }),
  );
}
