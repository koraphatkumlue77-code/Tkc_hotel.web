// SQL คืนเงินใช้ Payment ประเภท REFUND_REQUEST/REFUND_PAYOUT ไม่ได้แยกตาราง Refund
import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { centsToDecimal, decimalToCents } from "../bookings/money.js";

export class RefundsRepository {
  constructor(pool) { this.pool = pool; }

  async request(paymentId, input, employeeId) {
    return this.#transaction(async (connection) => {
      const [rows] = await connection.execute(`SELECT payment_id AS id, booking_id AS bookingId,
        transaction_type AS transactionType, direction, status, CAST(amount AS CHAR) AS amount
        FROM Payment WHERE payment_id = ? FOR UPDATE`, [paymentId]);
      const source = rows[0];
      if (!source || source.direction !== "IN" || !["VERIFIED","APPROVED","COMPLETED"].includes(source.status)) throw new ApiError(404, "REFUND_SOURCE_NOT_FOUND", "Refundable payment was not found");
      const [[reserved]] = await connection.execute(`SELECT COALESCE(SUM(amount), 0) AS amount FROM Payment
        WHERE related_payment_id = ? AND transaction_type = 'REFUND_REQUEST' AND status IN ('PENDING','APPROVED','COMPLETED') FOR UPDATE`, [paymentId]);
      const available = decimalToCents(source.amount) - decimalToCents(String(reserved.amount));
      const amountCents = decimalToCents(input.amount);
      if (amountCents > available) throw new ApiError(409, "REFUND_EXCEEDS_AVAILABLE", "Refund exceeds available payment amount", { available: centsToDecimal(Math.max(0, available)) });
      const [result] = await connection.execute(`INSERT INTO Payment
        (related_payment_id, booking_id, transaction_type, direction, amount, status,
         submitted_at, requested_by, requested_at, request_reason)
        VALUES (?, ?, 'REFUND_REQUEST', 'NONE', ?, 'PENDING', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)`,
      [paymentId, source.bookingId, input.amount, employeeId, input.reason]);
      const response = { id: Number(result.insertId), sourcePaymentId: paymentId, bookingId: Number(source.bookingId), amount: input.amount, status: "PENDING", reason: input.reason };
      await writeAudit(connection, { entityType: "Payment", entityId: response.id, action: "REFUND_REQUESTED", actor: { type: "employee", id: employeeId }, after: response, reason: input.reason });
      return response;
    });
  }

  async list({ page, limit }) {
    const [[count]] = await this.pool.execute("SELECT COUNT(*) AS total FROM Payment WHERE transaction_type = 'REFUND_REQUEST'");
    const [rows] = await this.pool.execute(`${REFUND_SELECT} ORDER BY p.created_at DESC, p.payment_id DESC LIMIT ? OFFSET ?`, [limit, (page - 1) * limit]);
    return { data: rows.map(refundRecord), meta: { page, limit, total: Number(count.total) } };
  }

  async decide(refundId, decision, input, employeeId) {
    return this.#transaction(async (connection) => {
      const request = await lockRefund(connection, refundId);
      if (request.status !== "PENDING") throw new ApiError(409, "REFUND_ALREADY_DECIDED", "Refund was already decided");
      if (decision === "APPROVED") await connection.execute("UPDATE Payment SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE payment_id = ?", [employeeId, refundId]);
      else await connection.execute("UPDATE Payment SET status = 'REJECTED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, rejection_reason = ? WHERE payment_id = ?", [employeeId, input.reason, refundId]);
      const response = { ...request, status: decision, decisionReason: input.reason };
      await writeAudit(connection, { entityType: "Payment", entityId: refundId, action: `REFUND_${decision}`, actor: { type: "employee", id: employeeId }, before: request, after: response, reason: input.reason });
      return response;
    });
  }

  async payout(refundId, input, employeeId) {
    return this.#transaction(async (connection) => {
      const [replays] = await connection.execute("SELECT payment_id AS id, related_payment_id AS refundId, booking_id AS bookingId, method, CAST(amount AS CHAR) AS amount, status FROM Payment WHERE idempotency_key = ? FOR UPDATE", [input.idempotencyKey]);
      if (replays[0]) {
        const replay = replays[0];
        if (Number(replay.refundId) !== refundId || replay.method !== input.method || replay.status !== "COMPLETED") throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for different input");
        return { data: payoutRecord(replay), replayed: true };
      }
      const request = await lockRefund(connection, refundId);
      if (request.status !== "APPROVED") throw new ApiError(409, "REFUND_NOT_APPROVED", "Refund must be approved before payout");
      const [existing] = await connection.execute("SELECT payment_id AS id FROM Payment WHERE transaction_type = 'REFUND_PAYOUT' AND related_payment_id = ? FOR UPDATE", [refundId]);
      if (existing[0]) throw new ApiError(409, "REFUND_ALREADY_PAID", "Refund payout was already recorded");
      const [result] = await connection.execute(`INSERT INTO Payment
        (related_payment_id, booking_id, transaction_type, direction, method, amount, status,
         submitted_at, verified_at, processed_by, processed_at, idempotency_key)
        VALUES (?, ?, 'REFUND_PAYOUT', 'OUT', ?, ?, 'COMPLETED', CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)`,
      [refundId, request.bookingId, input.method, request.amount, employeeId, input.idempotencyKey]);
      await connection.execute("UPDATE Payment SET status = 'COMPLETED', processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE payment_id = ?", [employeeId, refundId]);
      const data = { id: Number(result.insertId), refundId, bookingId: request.bookingId, method: input.method, amount: request.amount, status: "COMPLETED" };
      await writeAudit(connection, { entityType: "Payment", entityId: data.id, action: "REFUND_PAID", actor: { type: "employee", id: employeeId }, after: data });
      return { data, replayed: false };
    });
  }

  async #transaction(work) {
    const connection = await this.pool.getConnection();
    try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
    catch (error) {
      await connection.rollback();
      if (["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error?.code)) {
        throw new ApiError(409, "REFUND_CONFLICT", "Refund operation conflicts with an existing record");
      }
      throw error;
    }
    finally { connection.release(); }
  }
}

const REFUND_SELECT = `SELECT p.payment_id AS id, p.related_payment_id AS sourcePaymentId,
  p.booking_id AS bookingId, CAST(p.amount AS CHAR) AS amount, p.status,
  p.request_reason AS reason, p.requested_at AS requestedAt, p.approved_at AS approvedAt,
  p.rejection_reason AS rejectionReason FROM Payment p WHERE p.transaction_type = 'REFUND_REQUEST'`;
async function lockRefund(connection, id) { const [rows] = await connection.execute(`${REFUND_SELECT} AND p.payment_id = ? FOR UPDATE`, [id]); if (!rows[0]) throw new ApiError(404, "REFUND_NOT_FOUND", "Refund request was not found"); return refundRecord(rows[0]); }
function refundRecord(row) { return { ...row, id: Number(row.id), sourcePaymentId: Number(row.sourcePaymentId), bookingId: Number(row.bookingId) }; }
function payoutRecord(row) { return { id: Number(row.id), refundId: Number(row.refundId), bookingId: Number(row.bookingId), method: row.method, amount: row.amount, status: row.status }; }
