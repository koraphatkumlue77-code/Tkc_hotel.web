import { pool, withTransaction } from "./db.js";
import { bookingDetail, setBookingStatus } from "./bookings.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export async function submitPaymentAttempt(
  connection,
  {
    bookingId,
    amount,
    method,
    channelDetail = null,
    evidencePath = null,
    now = new Date(),
  },
) {
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [bookingId],
  );
  if (!booking) fail(404, "ไม่พบการจอง");
  if (!["held", "confirmed", "checked_in"].includes(booking.status))
    fail(409, "สถานะการจองไม่รองรับการชำระ");
  if (booking.status === "held" && new Date(booking.hold_until) < now)
    fail(409, "หมดเวลากันห้อง");
  if (
    !Number.isInteger(Number(amount)) ||
    Number(amount) <= 0 ||
    !["transfer_demo", "online_demo", "reception_demo"].includes(method)
  )
    fail(400, "ข้อมูลการชำระไม่ถูกต้อง");
  if (method === "transfer_demo" && !evidencePath)
    fail(400, "กรุณาแนบหลักฐานการโอน");
  const allowedChannels = {
    online_demo: ["credit", "debit", "paypal"],
    transfer_demo: ["bbl", "kbank", "scb", "ktb", "other"],
  };
  if (channelDetail && !allowedChannels[method]?.includes(channelDetail))
    fail(400, "ช่องทางชำระไม่ถูกต้อง");
  const [[totals]] = await connection.execute(
    "SELECT COALESCE(SUM(CASE WHEN status='approved' THEN amount ELSE 0 END),0) AS paid,COUNT(CASE WHEN status='pending_review' THEN 1 END) AS pending FROM payments WHERE booking_id=?",
    [bookingId],
  );
  if (Number(totals.pending) > 0) fail(409, "มีรายการรอบัญชีตรวจอยู่");
  if (Number(amount) > Number(booking.total) - Number(totals.paid))
    fail(400, "ยอดที่ส่งเกินยอดค้างชำระ");
  const [result] = await connection.execute(
    "INSERT INTO payments (booking_id,amount,method,channel_detail,evidence_path,status,auto_check,submitted_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      bookingId,
      amount,
      method,
      channelDetail,
      evidencePath,
      "pending_review",
      "รูปแบบและยอดถูกต้อง (จำลอง)",
      now,
    ],
  );
  if (booking.status === "held")
    await setBookingStatus(
      connection,
      bookingId,
      "held",
      "pending_review",
      null,
      "ส่งหลักฐานชำระเงินจำลอง",
    );
  await recordAudit(connection, {
    action: "submit",
    entity: "payment",
    entityId: result.insertId,
    after: { bookingId, amount, method, status: "pending_review" },
  });
  return {
    id: result.insertId,
    status: "pending_review",
    amount: Number(amount),
    method,
  };
}

export async function reviewPayment(
  connection,
  { paymentId, accountantId, decision, reason = null, now = new Date() },
) {
  if (!["approved", "rejected"].includes(decision)) fail(400, "ผลตรวจไม่ถูกต้อง");
  const [[payment]] = await connection.execute(
    "SELECT * FROM payments WHERE id=? FOR UPDATE",
    [paymentId],
  );
  if (!payment) fail(404, "ไม่พบรายการชำระ");
  if (payment.status !== "pending_review") fail(409, "รายการนี้ตรวจแล้ว");
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [payment.booking_id],
  );
  if (["cancelled", "no_show"].includes(booking.status))
    fail(409, "การจองปิดแล้ว");
  if (decision === "rejected" && !reason?.trim())
    fail(400, "กรุณาระบุเหตุผลที่ปฏิเสธ");
  await connection.execute(
    "UPDATE payments SET status=?,reviewed_at=?,reviewed_by=?,rejection_reason=? WHERE id=?",
    [decision, now, accountantId, reason, paymentId],
  );
  if (decision === "approved") {
    const [[totals]] = await connection.execute(
      "SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE booking_id=? AND status='approved'",
      [payment.booking_id],
    );
    if (
      booking.status === "pending_review" &&
      Number(totals.paid) >= Number(booking.deposit_due)
    )
      await setBookingStatus(
        connection,
        booking.id,
        "pending_review",
        "confirmed",
        accountantId,
        "บัญชีรับรองยอดมัดจำจำลอง",
      );
    else if (booking.status === "pending_review")
      await setBookingStatus(
        connection,
        booking.id,
        "pending_review",
        "held",
        accountantId,
        "ยอดชำระยังไม่ถึงมัดจำ",
      );
  } else if (booking.status === "pending_review") {
    await connection.execute("UPDATE bookings SET hold_until=? WHERE id=?", [
      new Date(now.getTime() + 15 * 60000),
      booking.id,
    ]);
    await setBookingStatus(
      connection,
      booking.id,
      "pending_review",
      "held",
      accountantId,
      reason,
    );
  }
  await recordAudit(connection, {
    actorId: accountantId,
    action: "review",
    entity: "payment",
    entityId: paymentId,
    before: { status: payment.status },
    after: { status: decision },
    reason,
  });
  return { id: Number(paymentId), status: decision, bookingId: booking.id };
}

export function paymentRoutes(app) {
  app.post(
    "/api/bookings/:id/payments",
    requireRole("member", "reception"),
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (
        req.session.role === "member" &&
        Number(detail.account_id) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์ชำระรายการนี้");
      if (
        req.session.role === "reception" &&
        req.body.method !== "reception_demo"
      )
        fail(400, "ฝ่ายต้อนรับบันทึกได้เฉพาะชำระจำลองที่เคาน์เตอร์");
      const payment = await withTransaction((c) =>
        submitPaymentAttempt(c, {
          bookingId: req.params.id,
          amount: req.body.amount,
          method: req.body.method,
          channelDetail: req.body.channelDetail,
          evidencePath: req.body.evidencePath,
        }),
      );
      res.status(201).json({ ...payment, simulated: true });
    }),
  );
  app.get(
    "/api/payments/pending",
    requireRole("accounting", "management", "superadmin"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT p.id,p.booking_id AS bookingId,p.amount,p.method,p.channel_detail AS channelDetail,p.evidence_path AS evidencePath,p.status,p.submitted_at AS submittedAt,TIMESTAMPDIFF(MINUTE,p.submitted_at,NOW()) AS waitingMinutes,c.full_name AS customerName FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN customers c ON c.id=b.customer_id WHERE p.status='pending_review' ORDER BY p.submitted_at",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/payments/:id/review",
    requireRole("accounting"),
    asyncRoute(async (req, res) =>
      res.json(
        await withTransaction((c) =>
          reviewPayment(c, {
            paymentId: req.params.id,
            accountantId: req.session.accountId,
            decision: req.body.decision,
            reason: req.body.reason,
          }),
        ),
      ),
    ),
  );
  app.post(
    "/api/payments/:id/escalations",
    requireRole("member"),
    asyncRoute(async (req, res) => {
      const [[payment]] = await pool.execute(
        "SELECT p.*,b.account_id AS accountId FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.id=?",
        [req.params.id],
      );
      if (
        !payment ||
        Number(payment.accountId) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์ติดตามรายการนี้");
      if (
        payment.status !== "pending_review" ||
        Date.now() - new Date(payment.submitted_at).getTime() < 30 * 60000
      )
        fail(409, "ติดตามได้เมื่อรอตรวจเกิน 30 นาที");
      const [result] = await pool.execute(
        "INSERT INTO payment_escalations (payment_id,requested_by) VALUES (?,?)",
        [req.params.id, req.session.accountId],
      );
      res.status(201).json({ id: result.insertId });
    }),
  );
  app.get(
    "/api/payments/escalations",
    requireRole("superadmin", "management"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT e.id,e.payment_id AS paymentId,e.created_at AS createdAt,p.booking_id AS bookingId,p.status FROM payment_escalations e JOIN payments p ON p.id=e.payment_id ORDER BY e.id DESC LIMIT 100",
      );
      res.json(rows);
    }),
  );
}
