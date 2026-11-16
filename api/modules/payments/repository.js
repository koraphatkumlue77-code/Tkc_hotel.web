import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { centsToDecimal, decimalToCents, percentageOfCents } from "../bookings/money.js";

export class PaymentsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async submitInitialProof({ bookingId, customerId, idempotencyKey, proofReference }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const typeIds = await bookingTypeIds(connection, bookingId, customerId);
      if (typeIds.length === 0) throw notFound();
      await lockInventory(connection, typeIds);
      const booking = await lockOwnedBooking(connection, bookingId, customerId);
      if (!booking) throw notFound();
      const expected = expectedInitialPayment(booking);

      const [replayRows] = await connection.execute(`
        SELECT payment_id AS id, booking_id AS bookingId,
               related_payment_id AS relatedPaymentId,
               transaction_type AS transactionType,
               CAST(amount AS CHAR) AS amount, status,
               proof_reference AS proofReference, submitted_at AS submittedAt
        FROM Payment WHERE idempotency_key = ? FOR UPDATE
      `, [idempotencyKey]);
      if (replayRows[0]) {
        const replay = paymentRecord(replayRows[0]);
        validateReplay(replay, { bookingId, relatedPaymentId: null, ...expected });
        await connection.commit();
        return { payment: replay, replayed: true };
      }

      if (booking.status !== "PENDING_PAYMENT") {
        throw new ApiError(409, "BOOKING_PAYMENT_STATE_INVALID", "Booking is not waiting for payment proof");
      }
      if (!booking.holdActive) {
        throw new ApiError(409, "BOOKING_HOLD_EXPIRED", "Booking payment hold has expired");
      }
      const [result] = await connection.execute(`
        INSERT INTO Payment
          (booking_id, transaction_type, direction, method, amount, status,
           proof_reference, submitted_at, idempotency_key)
        VALUES (?, ?, 'IN', 'BANK_TRANSFER', ?, 'SUBMITTED', ?, CURRENT_TIMESTAMP, ?)
      `, [bookingId, expected.transactionType, expected.amount, proofReference, idempotencyKey]);
      await connection.execute(`
        UPDATE Booking
        SET status = 'PAYMENT_REVIEW', status_changed_at = CURRENT_TIMESTAMP,
            hold_expires_at = NULL
        WHERE booking_id = ?
      `, [bookingId]);
      const payment = {
        id: Number(result.insertId),
        bookingId,
        transactionType: expected.transactionType,
        amount: expected.amount,
        status: "SUBMITTED",
        proofReference
      };
      await writeAudit(connection, {
        entityType: "Payment",
        entityId: payment.id,
        action: "PAYMENT_SUBMITTED",
        actor: { type: "customer", id: customerId },
        after: payment
      });
      await writeAudit(connection, {
        entityType: "Booking",
        entityId: bookingId,
        action: "PAYMENT_REVIEW_STARTED",
        actor: { type: "customer", id: customerId },
        before: { status: booking.status },
        after: { status: "PAYMENT_REVIEW", paymentId: payment.id }
      });
      await connection.commit();
      return { payment, replayed: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used");
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async resubmitProof({ bookingId, customerId, idempotencyKey, proofReference }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const typeIds = await bookingTypeIds(connection, bookingId, customerId);
      if (typeIds.length === 0) throw notFound();
      await lockInventory(connection, typeIds);
      const booking = await lockOwnedBooking(connection, bookingId, customerId);
      if (!booking) throw notFound();
      const expected = expectedInitialPayment(booking);
      const [rejectedRows] = await connection.execute(`
        SELECT payment_id AS id
        FROM Payment
        WHERE booking_id = ? AND status = 'REJECTED'
        ORDER BY payment_id DESC LIMIT 1 FOR UPDATE
      `, [bookingId]);
      const rejected = rejectedRows[0];
      if (!rejected) {
        throw new ApiError(409, "PAYMENT_REJECTION_REQUIRED", "No rejected proof is available for replacement");
      }
      const [replayRows] = await connection.execute(`
        SELECT payment_id AS id, booking_id AS bookingId,
               related_payment_id AS relatedPaymentId,
               transaction_type AS transactionType,
               CAST(amount AS CHAR) AS amount, status,
               proof_reference AS proofReference, submitted_at AS submittedAt
        FROM Payment WHERE idempotency_key = ? FOR UPDATE
      `, [idempotencyKey]);
      if (replayRows[0]) {
        const replay = paymentRecord(replayRows[0]);
        validateReplay(replay, {
          bookingId,
          relatedPaymentId: Number(rejected.id),
          ...expected
        });
        await connection.commit();
        return { payment: replay, replayed: true };
      }
      if (booking.status !== "PENDING_PAYMENT") {
        throw new ApiError(409, "BOOKING_PAYMENT_STATE_INVALID", "Booking is not waiting for replacement proof");
      }
      if (!booking.holdActive) {
        throw new ApiError(409, "BOOKING_HOLD_EXPIRED", "Replacement proof window has expired");
      }
      const [result] = await connection.execute(`
        INSERT INTO Payment
          (related_payment_id, booking_id, transaction_type, direction, method,
           amount, status, proof_reference, submitted_at, idempotency_key)
        VALUES (?, ?, ?, 'IN', 'BANK_TRANSFER', ?, 'SUBMITTED', ?, CURRENT_TIMESTAMP, ?)
      `, [
        rejected.id,
        bookingId,
        expected.transactionType,
        expected.amount,
        proofReference,
        idempotencyKey
      ]);
      await connection.execute(`
        UPDATE Booking
        SET status = 'PAYMENT_REVIEW', status_changed_at = CURRENT_TIMESTAMP,
            hold_expires_at = NULL
        WHERE booking_id = ?
      `, [bookingId]);
      const payment = {
        id: Number(result.insertId),
        relatedPaymentId: Number(rejected.id),
        bookingId,
        transactionType: expected.transactionType,
        amount: expected.amount,
        status: "SUBMITTED",
        proofReference
      };
      await writeAudit(connection, {
        entityType: "Payment",
        entityId: payment.id,
        action: "PAYMENT_RESUBMITTED",
        actor: { type: "customer", id: customerId },
        after: payment
      });
      await writeAudit(connection, {
        entityType: "Booking",
        entityId: bookingId,
        action: "PAYMENT_REVIEW_RESTARTED",
        actor: { type: "customer", id: customerId },
        before: { status: booking.status },
        after: { status: "PAYMENT_REVIEW", paymentId: payment.id }
      });
      await connection.commit();
      return { payment, replayed: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used");
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async listAccounting({ page, limit, status }) {
    const where = status ? "WHERE p.status = ?" : "";
    const values = status ? [status] : [];
    const [[countRow]] = await this.pool.execute(
      `SELECT COUNT(*) AS total FROM Payment p ${where}`,
      values
    );
    const [rows] = await this.pool.execute(`
      ${accountingSelect()}
      ${where}
      ORDER BY p.submitted_at DESC, p.payment_id DESC
      LIMIT ? OFFSET ?
    `, [...values, limit, (page - 1) * limit]);
    return {
      data: rows.map(accountingRecord),
      meta: { page, limit, total: Number(countRow.total) }
    };
  }

  async getAccounting(paymentId) {
    const [rows] = await this.pool.execute(`
      ${accountingSelect()}
      WHERE p.payment_id = ? LIMIT 1
    `, [paymentId]);
    if (!rows[0]) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found");
    return accountingRecord(rows[0]);
  }

  async getProofAccess(paymentId) {
    const [rows] = await this.pool.execute(`
      SELECT p.proof_reference AS proofReference, b.customer_id AS customerId
      FROM Payment p JOIN Booking b ON b.booking_id = p.booking_id
      WHERE p.payment_id = ? AND p.proof_reference IS NOT NULL LIMIT 1
    `, [paymentId]);
    if (!rows[0]) return null;
    return { ...rows[0], customerId: Number(rows[0].customerId) };
  }

  async decide({ paymentId, employeeId, decision, reason }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [references] = await connection.execute(
        "SELECT booking_id AS bookingId FROM Payment WHERE payment_id = ? LIMIT 1",
        [paymentId]
      );
      if (!references[0]) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found");
      const bookingId = Number(references[0].bookingId);
      const [bookingRows] = await connection.execute(`
        SELECT booking_id AS id, status, hold_expires_at AS holdExpiresAt
        FROM Booking WHERE booking_id = ? FOR UPDATE
      `, [bookingId]);
      const booking = bookingRows[0];
      const [paymentRows] = await connection.execute(`
        SELECT payment_id AS id, status, verified_by AS verifiedBy,
               verified_at AS verifiedAt, rejection_reason AS rejectionReason
        FROM Payment WHERE payment_id = ? FOR UPDATE
      `, [paymentId]);
      const payment = paymentRows[0];
      if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found");
      if (payment.status === decision) {
        await connection.commit();
        return {
          data: decisionResponse(paymentId, bookingId, payment, booking),
          replayed: true
        };
      }
      if (payment.status !== "SUBMITTED" || booking.status !== "PAYMENT_REVIEW") {
        throw new ApiError(409, "PAYMENT_DECISION_CONFLICT", "Payment has already been decided");
      }

      if (decision === "VERIFIED") {
        await connection.execute(`
          UPDATE Payment
          SET status = 'VERIFIED', verified_by = ?, verified_at = CURRENT_TIMESTAMP
          WHERE payment_id = ?
        `, [employeeId, paymentId]);
        await connection.execute(`
          UPDATE Booking
          SET status = 'CONFIRMED', status_changed_at = CURRENT_TIMESTAMP,
              status_changed_by = ?, hold_expires_at = NULL
          WHERE booking_id = ?
        `, [employeeId, bookingId]);
      } else {
        await connection.execute(`
          UPDATE Payment
          SET status = 'REJECTED', verified_by = ?, verified_at = CURRENT_TIMESTAMP,
              rejection_reason = ?
          WHERE payment_id = ?
        `, [employeeId, reason, paymentId]);
        await connection.execute(`
          UPDATE Booking
          SET status = 'PENDING_PAYMENT', status_changed_at = CURRENT_TIMESTAMP,
              status_changed_by = ?,
              hold_expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE)
          WHERE booking_id = ?
        `, [employeeId, bookingId]);
      }
      const [[afterPayment]] = await connection.execute(`
        SELECT payment_id AS id, status, verified_by AS verifiedBy,
               verified_at AS verifiedAt, rejection_reason AS rejectionReason
        FROM Payment WHERE payment_id = ?
      `, [paymentId]);
      const [[afterBooking]] = await connection.execute(`
        SELECT booking_id AS id, status, hold_expires_at AS holdExpiresAt
        FROM Booking WHERE booking_id = ?
      `, [bookingId]);
      await writeAudit(connection, {
        entityType: "Payment",
        entityId: paymentId,
        action: decision === "VERIFIED" ? "PAYMENT_VERIFIED" : "PAYMENT_REJECTED",
        actor: { type: "employee", id: employeeId },
        before: { status: payment.status },
        after: { status: afterPayment.status },
        reason
      });
      await writeAudit(connection, {
        entityType: "Booking",
        entityId: bookingId,
        action: decision === "VERIFIED" ? "BOOKING_CONFIRMED" : "PAYMENT_RETRY_OPENED",
        actor: { type: "employee", id: employeeId },
        before: { status: booking.status },
        after: { status: afterBooking.status, holdExpiresAt: afterBooking.holdExpiresAt },
        reason
      });
      await connection.commit();
      return {
        data: decisionResponse(paymentId, bookingId, afterPayment, afterBooking),
        replayed: false
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async recordReceipt({ bookingId, employeeId, amount, method, idempotencyKey }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [bookingRows] = await connection.execute(`
        SELECT booking_id AS id, status, channel,
               CAST(total_snapshot AS CHAR) AS total
        FROM Booking WHERE booking_id = ? FOR UPDATE
      `, [bookingId]);
      const booking = bookingRows[0];
      if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
      const [replayRows] = await connection.execute(`
        SELECT payment_id AS id, booking_id AS bookingId,
               transaction_type AS transactionType, method,
               CAST(amount AS CHAR) AS amount, status,
               submitted_at AS submittedAt, verified_at AS verifiedAt
        FROM Payment WHERE idempotency_key = ? FOR UPDATE
      `, [idempotencyKey]);
      const paidCents = await acceptedIncomingCents(connection, bookingId);
      const totalCents = decimalToCents(booking.total);
      if (replayRows[0]) {
        const replay = receiptRecord(replayRows[0], totalCents, paidCents);
        if (replay.bookingId !== bookingId || replay.amount !== centsToDecimal(decimalToCents(amount))
            || replay.method !== method || replay.status !== "VERIFIED"
            || !["BALANCE", "FULL_PAYMENT"].includes(replay.transactionType)) {
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for different payment input");
        }
        await connection.commit();
        return { payment: replay, replayed: true };
      }
      if (!["CONFIRMED", "LATE_ARRIVAL", "CHECKED_IN"].includes(booking.status)) {
        throw new ApiError(409, "BOOKING_PAYMENT_STATE_INVALID", "Booking cannot receive a payment in its current state");
      }
      const amountCents = decimalToCents(amount);
      const outstandingCents = Math.max(0, totalCents - paidCents);
      if (amountCents > outstandingCents) {
        throw new ApiError(409, "PAYMENT_EXCEEDS_OUTSTANDING", "Payment exceeds the booking outstanding amount");
      }
      const transactionType = booking.channel === "WALK_IN"
        && paidCents === 0 && amountCents === totalCents
        ? "FULL_PAYMENT"
        : "BALANCE";
      const normalizedAmount = centsToDecimal(amountCents);
      const [result] = await connection.execute(`
        INSERT INTO Payment
          (booking_id, transaction_type, direction, verified_by, method, amount,
           status, submitted_at, verified_at, idempotency_key)
        VALUES (?, ?, 'IN', ?, ?, ?, 'VERIFIED', CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP, ?)
      `, [bookingId, transactionType, employeeId, method, normalizedAmount, idempotencyKey]);
      const payment = {
        id: Number(result.insertId),
        bookingId,
        transactionType,
        method,
        amount: normalizedAmount,
        status: "VERIFIED",
        outstanding: centsToDecimal(outstandingCents - amountCents)
      };
      await writeAudit(connection, {
        entityType: "Payment",
        entityId: payment.id,
        action: "PAYMENT_RECEIVED",
        actor: { type: "employee", id: employeeId },
        after: payment
      });
      await connection.commit();
      return { payment, replayed: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used");
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async financialSummary({ from, to }) {
    const connection = await this.pool.getConnection();
    let previousTimeZone;
    try {
      const [[session]] = await connection.query("SELECT @@session.time_zone AS timeZone");
      previousTimeZone = session.timeZone;
      await connection.query("SET time_zone = '+00:00'");
      await connection.beginTransaction();
      const periodWhere = `p.direction = 'IN'
        AND p.status IN ('VERIFIED', 'APPROVED', 'COMPLETED')
        AND DATE(CONVERT_TZ(p.submitted_at, '+00:00', '+07:00')) BETWEEN ? AND ?`;
      const [[totalRow]] = await connection.execute(`
        SELECT CAST(COALESCE(SUM(p.amount), 0) AS CHAR) AS incomingTotal,
               COUNT(*) AS paymentCount
        FROM Payment p WHERE ${periodWhere}
      `, [from, to]);
      const [methods] = await connection.execute(`
        SELECT p.method, CAST(SUM(p.amount) AS CHAR) AS amount, COUNT(*) AS count
        FROM Payment p WHERE ${periodWhere}
        GROUP BY p.method ORDER BY p.method
      `, [from, to]);
      const [types] = await connection.execute(`
        SELECT p.transaction_type AS transactionType,
               CAST(SUM(p.amount) AS CHAR) AS amount, COUNT(*) AS count
        FROM Payment p WHERE ${periodWhere}
        GROUP BY p.transaction_type ORDER BY p.transaction_type
      `, [from, to]);
      await connection.commit();
      return {
        data: {
          from,
          to,
          incomingTotal: totalRow.incomingTotal,
          paymentCount: Number(totalRow.paymentCount),
          byMethod: methods.map((row) => ({ ...row, count: Number(row.count) })),
          byTransactionType: types.map((row) => ({ ...row, count: Number(row.count) }))
        }
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      let reusable = true;
      if (previousTimeZone) {
        await connection.query("SET time_zone = ?", [previousTimeZone]).catch(() => {
          reusable = false;
          connection.destroy();
        });
      }
      if (reusable) connection.release();
    }
  }
}

async function acceptedIncomingCents(connection, bookingId) {
  const [[row]] = await connection.execute(`
    SELECT CAST(COALESCE(SUM(amount), 0) AS CHAR) AS paid
    FROM Payment
    WHERE booking_id = ? AND direction = 'IN'
      AND status IN ('VERIFIED', 'APPROVED', 'COMPLETED')
  `, [bookingId]);
  return decimalToCents(row.paid);
}

function receiptRecord(row, totalCents, paidCents) {
  return {
    id: Number(row.id),
    bookingId: Number(row.bookingId),
    transactionType: row.transactionType,
    method: row.method,
    amount: row.amount,
    status: row.status,
    submittedAt: row.submittedAt,
    verifiedAt: row.verifiedAt,
    outstanding: centsToDecimal(Math.max(0, totalCents - paidCents))
  };
}

function decisionResponse(paymentId, bookingId, payment, booking) {
  return {
    payment: {
      id: paymentId,
      status: payment.status,
      verifiedBy: payment.verifiedBy == null ? null : Number(payment.verifiedBy),
      verifiedAt: payment.verifiedAt,
      rejectionReason: payment.rejectionReason
    },
    booking: {
      id: bookingId,
      status: booking.status,
      holdExpiresAt: booking.holdExpiresAt
    }
  };
}

function accountingSelect() {
  return `SELECT p.payment_id AS id, p.related_payment_id AS relatedPaymentId,
                 p.transaction_type AS transactionType, p.direction, p.method,
                 CAST(p.amount AS CHAR) AS amount, p.status,
                 p.submitted_at AS submittedAt, p.verified_at AS verifiedAt,
                 p.rejection_reason AS rejectionReason,
                 b.booking_id AS bookingId, b.booking_code AS bookingCode,
                 b.status AS bookingStatus, b.channel AS bookingChannel,
                 DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
                 DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
                 c.customer_id AS customerId, c.full_name AS customerName,
                 c.email AS customerEmail, c.phone AS customerPhone
          FROM Payment p
          JOIN Booking b ON b.booking_id = p.booking_id
          JOIN Customer c ON c.customer_id = b.customer_id`;
}

function accountingRecord(row) {
  return {
    id: Number(row.id),
    relatedPaymentId: row.relatedPaymentId == null ? null : Number(row.relatedPaymentId),
    transactionType: row.transactionType,
    direction: row.direction,
    method: row.method,
    amount: row.amount,
    status: row.status,
    submittedAt: row.submittedAt,
    verifiedAt: row.verifiedAt,
    rejectionReason: row.rejectionReason,
    proofUrl: `/api/payments/${Number(row.id)}/proof`,
    booking: {
      id: Number(row.bookingId),
      code: row.bookingCode,
      status: row.bookingStatus,
      channel: row.bookingChannel,
      checkIn: row.checkIn,
      checkOut: row.checkOut
    },
    customer: {
      id: Number(row.customerId),
      name: row.customerName,
      email: row.customerEmail,
      phone: row.customerPhone
    }
  };
}

async function bookingTypeIds(connection, bookingId, customerId) {
  const [rows] = await connection.execute(`
    SELECT DISTINCT br.room_type_id AS roomTypeId
    FROM Booking b JOIN BookingRoom br ON br.booking_id = b.booking_id
    WHERE b.booking_id = ? AND b.customer_id = ?
    ORDER BY br.room_type_id
  `, [bookingId, customerId]);
  return rows.map(({ roomTypeId }) => Number(roomTypeId));
}

async function lockInventory(connection, typeIds) {
  const placeholders = typeIds.map(() => "?").join(", ");
  await connection.execute(`
    SELECT room_type_id FROM RoomType
    WHERE room_type_id IN (${placeholders}) ORDER BY room_type_id FOR UPDATE
  `, typeIds);
  await connection.execute(`
    SELECT room_id FROM Room
    WHERE room_type_id IN (${placeholders}) ORDER BY room_id FOR UPDATE
  `, typeIds);
}

async function lockOwnedBooking(connection, bookingId, customerId) {
  const [rows] = await connection.execute(`
    SELECT booking_id AS id, status,
           CAST(total_snapshot AS CHAR) AS total,
           CAST(deposit_rate AS CHAR) AS depositRate,
           (hold_expires_at > CURRENT_TIMESTAMP) AS holdActive
    FROM Booking
    WHERE booking_id = ? AND customer_id = ?
    FOR UPDATE
  `, [bookingId, customerId]);
  if (!rows[0]) return null;
  return { ...rows[0], id: Number(rows[0].id), holdActive: Boolean(rows[0].holdActive) };
}

function expectedInitialPayment(booking) {
  const totalCents = decimalToCents(booking.total);
  if (totalCents === 0) {
    throw new ApiError(409, "BOOKING_PAYMENT_NOT_REQUIRED", "Booking does not require payment");
  }
  const dueCents = Math.max(1, percentageOfCents(totalCents, booking.depositRate));
  return {
    amount: centsToDecimal(dueCents),
    transactionType: booking.depositRate === "100.00" ? "FULL_PAYMENT" : "DEPOSIT"
  };
}

function paymentRecord(row) {
  return {
    id: Number(row.id),
    relatedPaymentId: row.relatedPaymentId == null ? null : Number(row.relatedPaymentId),
    bookingId: Number(row.bookingId),
    transactionType: row.transactionType,
    amount: row.amount,
    status: row.status,
    proofReference: row.proofReference,
    submittedAt: row.submittedAt
  };
}

function validateReplay(replay, expected) {
  if (replay.bookingId !== expected.bookingId
      || replay.relatedPaymentId !== expected.relatedPaymentId
      || replay.transactionType !== expected.transactionType
      || replay.amount !== expected.amount) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for different payment input");
  }
}

function notFound() {
  return new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
}
