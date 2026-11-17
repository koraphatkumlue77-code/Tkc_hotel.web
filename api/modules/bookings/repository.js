import crypto from "node:crypto";

import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { centsToDecimal, decimalToCents, percentageOfCents } from "./money.js";

const MAX_MONEY_CENTS = 999_999_999_999;

export class BookingsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createCustomerBooking(input, customerId, options = {}) {
    let status = options.status ?? "PENDING_PAYMENT";
    const channel = options.channel ?? "ONLINE";
    const actor = options.actor ?? { type: "customer", id: customerId };
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const requestedByType = countRequestedRooms(input.rooms);
      const typeIds = [...requestedByType.keys()].sort((left, right) => left - right);
      const roomTypes = await lockRoomTypes(connection, typeIds);
      validateRoomSelections(input.rooms, roomTypes);
      await lockInventoryRooms(connection, typeIds);
      await ensureInventory(connection, input, requestedByType, roomTypes);
      const promotions = await lockPromotions(connection, input.promotionCodes);
      const calculated = calculateBooking(input, roomTypes, promotions);
      if (channel === "ONLINE" && calculated.totalCents === 0) status = "CONFIRMED";
      const resolvedCustomerId = options.walkInCustomer
        ? await resolveWalkInCustomer(connection, options.walkInCustomer, actor.id)
        : customerId;
      const bookingCode = createBookingCode();
      const [bookingResult] = await connection.execute(`
        INSERT INTO Booking
          (booking_code, customer_id, status, status_changed_at, channel,
           check_in_date, check_out_date, hold_expires_at, deposit_rate,
           room_subtotal_snapshot, service_subtotal_snapshot,
           discount_total_snapshot, total_snapshot)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?,
                IF(? = 'PENDING_PAYMENT', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE), NULL),
                ?, ?, ?, ?, ?)
      `, [
        bookingCode,
        resolvedCustomerId,
        status,
        channel,
        input.checkIn,
        input.checkOut,
        status,
        calculated.depositRate,
        centsToDecimal(calculated.roomSubtotalCents),
        centsToDecimal(calculated.serviceSubtotalCents),
        centsToDecimal(calculated.discountTotalCents),
        centsToDecimal(calculated.totalCents)
      ]);

      const bookingId = Number(bookingResult.insertId);
      const bookingRooms = [];
      for (const room of input.rooms) {
        const roomType = roomTypes.get(room.roomTypeId);
        const nightlyRateCents = decimalToCents(roomType.pricePerNight);
        const netAmountCents = multiplyMoney(nightlyRateCents, input.nights);
        const [result] = await connection.execute(`
          INSERT INTO BookingRoom
            (booking_id, room_type_id, guest_count, nightly_rate_snapshot, net_amount)
          VALUES (?, ?, ?, ?, ?)
        `, [
          bookingId,
          room.roomTypeId,
          room.guestCount,
          centsToDecimal(nightlyRateCents),
          centsToDecimal(netAmountCents)
        ]);
        bookingRooms.push({
          id: Number(result.insertId),
          roomTypeId: room.roomTypeId,
          guestCount: room.guestCount,
          nightlyRate: centsToDecimal(nightlyRateCents),
          netAmount: centsToDecimal(netAmountCents)
        });
      }

      await assignPhysicalRooms(
        connection,
        bookingRooms,
        options.roomAssignments ?? [],
        input,
        actor
      );

      for (const promotion of calculated.promotions) {
        await connection.execute(`
          INSERT INTO BookingPromotion
            (booking_id, promotion_id, sequence_no, percent_snapshot,
             base_amount_before, discount_amount, base_amount_after)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          bookingId,
          promotion.id,
          promotion.sequence,
          promotion.percent,
          promotion.baseBefore,
          promotion.discountAmount,
          promotion.baseAfter
        ]);
      }

      if (input.breakfastDates.length > 0) {
        const [serviceResult] = await connection.execute(`
          INSERT INTO BookingService (booking_id, service_id, status)
          VALUES (?, 1, 'SELECTED')
        `, [bookingId]);
        for (let index = 0; index < bookingRooms.length; index += 1) {
          const room = bookingRooms[index];
          const roomType = roomTypes.get(room.roomTypeId);
          for (const usageDate of input.breakfastDates) {
            await connection.execute(`
              INSERT INTO ServiceUsage
                (booking_service_id, booking_room_id, usage_date,
                 unit_price_snapshot, quantity, status)
              VALUES (?, ?, ?, ?, 1, 'ACTIVE')
            `, [
              serviceResult.insertId,
              room.id,
              usageDate,
              roomType.breakfastDailyRate
            ]);
          }
        }
      }

      const [bookingRows] = await connection.execute(`
        SELECT hold_expires_at AS holdExpiresAt, created_at AS createdAt
        FROM Booking WHERE booking_id = ?
      `, [bookingId]);
      const response = {
        id: bookingId,
        bookingCode,
        status,
        channel,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: input.nights,
        holdExpiresAt: bookingRows[0].holdExpiresAt,
        depositRate: calculated.depositRate,
        roomSubtotal: centsToDecimal(calculated.roomSubtotalCents),
        serviceSubtotal: centsToDecimal(calculated.serviceSubtotalCents),
        discountTotal: centsToDecimal(calculated.discountTotalCents),
        total: centsToDecimal(calculated.totalCents),
        paymentDue: centsToDecimal(calculated.paymentDueCents),
        rooms: bookingRooms,
        breakfastDates: input.breakfastDates,
        promotions: calculated.promotions,
        createdAt: bookingRows[0].createdAt
      };
      await writeAudit(connection, {
        entityType: "Booking",
        entityId: bookingId,
        action: "BOOKING_CREATED",
        actor,
        after: response
      });
      await connection.commit();
      return response;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createWalkIn(input, customerInput, employeeId) {
    return this.createCustomerBooking(input, null, {
      status: "CONFIRMED",
      channel: "WALK_IN",
      actor: { type: "employee", id: employeeId },
      roomAssignments: customerInput.roomAssignments,
      walkInCustomer: customerInput
    });
  }

  async listStaff({ page, limit, channel, status }) {
    const clauses = [];
    const values = [];
    if (channel) {
      clauses.push("b.channel = ?");
      values.push(channel);
    }
    if (status) {
      clauses.push("b.status = ?");
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [[countRow]] = await this.pool.execute(
      `SELECT COUNT(*) AS total FROM Booking b ${where}`,
      values
    );
    const [rows] = await this.pool.execute(`
      SELECT b.booking_id AS id, b.booking_code AS bookingCode, b.status,
             b.channel, DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
             CAST(b.total_snapshot AS CHAR) AS total,
             c.customer_id AS customerId, c.full_name AS customerName,
             b.created_at AS createdAt
      FROM Booking b JOIN Customer c ON c.customer_id = b.customer_id
      ${where}
      ORDER BY b.created_at DESC, b.booking_id DESC
      LIMIT ? OFFSET ?
    `, [...values, limit, (page - 1) * limit]);
    return { data: rows, meta: { page, limit, total: Number(countRow.total) } };
  }

  async getStaff(bookingId) {
    const [rows] = await this.pool.execute(`
      SELECT b.booking_id AS id, b.booking_code AS bookingCode, b.status,
             b.channel, DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
             b.hold_expires_at AS holdExpiresAt,
             CAST(b.service_subtotal_snapshot AS CHAR) AS serviceSubtotal,
             CAST(b.total_snapshot AS CHAR) AS total,
             c.customer_id AS customerId, c.full_name AS customerName,
             c.email AS customerEmail, c.phone AS customerPhone,
             c.member_status AS customerMemberStatus
      FROM Booking b JOIN Customer c ON c.customer_id = b.customer_id
      WHERE b.booking_id = ? LIMIT 1
    `, [bookingId]);
    const booking = rows[0];
    if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
    const [rooms, services, tours] = await Promise.all([
      this.pool.execute(`
        SELECT br.booking_room_id AS id, br.room_type_id AS roomTypeId,
               rt.type_name AS roomTypeName, br.guest_count AS guestCount,
               CAST(br.nightly_rate_snapshot AS CHAR) AS nightlyRate,
               ra.room_id AS assignedRoomId, r.room_code AS assignedRoomCode
        FROM BookingRoom br
        JOIN RoomType rt ON rt.room_type_id = br.room_type_id
        LEFT JOIN RoomAssignment ra ON ra.assignment_id = (
          SELECT MAX(current_ra.assignment_id)
          FROM RoomAssignment current_ra
          WHERE current_ra.booking_room_id = br.booking_room_id
            AND current_ra.effective_to > current_ra.effective_from
        )
        LEFT JOIN Room r ON r.room_id = ra.room_id
        WHERE br.booking_id = ? ORDER BY br.booking_room_id
      `, [bookingId]).then(([records]) => records),
      this.pool.execute(`
        SELECT bs.booking_service_id AS id, s.name, bs.status,
               su.usage_date AS usageDate,
               TIME_FORMAT(su.start_time, '%H:%i:%s') AS startTime,
               su.quantity, CAST(CAST(CASE WHEN su.service_usage_id = (
                 SELECT MIN(first_usage.service_usage_id) FROM ServiceUsage first_usage
                 WHERE first_usage.booking_service_id = bs.booking_service_id
                   AND first_usage.status = 'ACTIVE'
               ) THEN (
                 SELECT COALESCE(SUM(charged.unit_price_snapshot * charged.quantity), 0)
                 FROM ServiceUsage charged
                 WHERE charged.booking_service_id = bs.booking_service_id
                   AND (charged.status = 'PASS_CHARGE'
                     OR (charged.status = 'ACTIVE' AND charged.unit_price_snapshot > 0))
               ) ELSE 0 END AS DECIMAL(12,2)) AS CHAR) AS amount
        FROM BookingService bs
        JOIN Service s ON s.service_id = bs.service_id
        LEFT JOIN ServiceUsage su ON su.booking_service_id = bs.booking_service_id
        WHERE bs.booking_id = ? AND bs.status = 'SELECTED' AND su.status = 'ACTIVE'
        ORDER BY bs.booking_service_id, su.usage_date, su.start_time
      `, [bookingId]).then(([records]) => records),
      this.pool.execute(`
        SELECT s.name,
               JSON_UNQUOTE(JSON_EXTRACT(s.schedule_json, '$.location')) AS location,
               DATE_FORMAT(round_data.tour_date, '%Y-%m-%d') AS tourDate,
               TIME_FORMAT(round_data.start_time, '%H:%i:%s') AS startTime,
               COUNT(*) AS quantity, CAST(SUM(tr.unit_price_snapshot) AS CHAR) AS amount
        FROM TourReservation tr
        JOIN TourRound round_data ON round_data.tour_round_id = tr.tour_round_id
        JOIN Service s ON s.service_id = round_data.service_id
        WHERE tr.booking_id = ? AND tr.status <> 'CANCELLED'
        GROUP BY tr.tour_round_id, s.name, location, round_data.tour_date, round_data.start_time
        ORDER BY round_data.tour_date, round_data.start_time, tr.tour_round_id
      `, [bookingId]).then(([records]) => records.map((record) => ({
        ...record, quantity: Number(record.quantity)
      })))
    ]);
    return {
      id: Number(booking.id),
      bookingCode: booking.bookingCode,
      status: booking.status,
      channel: booking.channel,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      holdExpiresAt: booking.holdExpiresAt,
      serviceSubtotal: booking.serviceSubtotal,
      total: booking.total,
      customer: {
        id: Number(booking.customerId),
        fullName: booking.customerName,
        email: booking.customerEmail,
        phone: booking.customerPhone,
        memberStatus: booking.customerMemberStatus
      },
      rooms,
      services,
      tours
    };
  }

  async listMine(customerId, { page, limit }) {
    const offset = (page - 1) * limit;
    const [[countRow]] = await this.pool.execute(
      "SELECT COUNT(*) AS total FROM Booking WHERE customer_id = ?",
      [customerId]
    );
    const [rows] = await this.pool.execute(`
      SELECT b.booking_id AS id, b.booking_code AS bookingCode,
             b.status, b.channel, DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
             b.hold_expires_at AS holdExpiresAt,
             CAST(b.deposit_rate AS CHAR) AS depositRate,
             CAST(b.total_snapshot AS CHAR) AS total,
             b.created_at AS createdAt, b.updated_at AS updatedAt,
             CASE
               WHEN b.status = 'PENDING_PAYMENT'
                    AND b.hold_expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
               ELSE b.status
             END AS effectiveStatus
      FROM Booking b
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC, b.booking_id DESC
      LIMIT ? OFFSET ?
    `, [customerId, limit, offset]);
    return { data: rows, meta: { page, limit, total: Number(countRow.total) } };
  }

  async getMine(bookingId, customerId) {
    const [bookingRows] = await this.pool.execute(`
      SELECT b.booking_id AS id, b.booking_code AS bookingCode,
             b.status, b.channel, DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
             b.expected_arrival_at AS expectedArrivalAt,
             b.hold_expires_at AS holdExpiresAt,
             CAST(b.deposit_rate AS CHAR) AS depositRate,
             CAST(b.room_subtotal_snapshot AS CHAR) AS roomSubtotal,
             CAST(b.service_subtotal_snapshot AS CHAR) AS serviceSubtotal,
             CAST(b.discount_total_snapshot AS CHAR) AS discountTotal,
             CAST(b.total_snapshot AS CHAR) AS total,
             b.created_at AS createdAt, b.updated_at AS updatedAt,
             CASE
               WHEN b.status = 'PENDING_PAYMENT'
                    AND b.hold_expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
               ELSE b.status
             END AS effectiveStatus
      FROM Booking b
      WHERE b.booking_id = ? AND b.customer_id = ?
      LIMIT 1
    `, [bookingId, customerId]);
    const booking = bookingRows[0];
    if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");

    const [rooms, tours, services, promotions, paymentRows, timeline, review, refunds] = await Promise.all([
      this.pool.execute(`
        SELECT br.booking_room_id AS id, br.room_type_id AS roomTypeId,
               rt.type_name AS roomTypeName, br.guest_count AS guestCount,
               CAST(br.nightly_rate_snapshot AS CHAR) AS nightlyRate,
               CAST(br.net_amount AS CHAR) AS netAmount
        FROM BookingRoom br JOIN RoomType rt ON rt.room_type_id = br.room_type_id
        WHERE br.booking_id = ? ORDER BY br.booking_room_id
      `, [bookingId]).then(([rows]) => rows),
      this.pool.execute(`
        SELECT tr.tour_round_id AS roundId, s.name,
               JSON_UNQUOTE(JSON_EXTRACT(s.schedule_json, '$.location')) AS location,
               DATE_FORMAT(round_data.tour_date, '%Y-%m-%d') AS tourDate,
               TIME_FORMAT(round_data.start_time, '%H:%i:%s') AS startTime,
               tr.status, COUNT(*) AS quantity,
               CAST(SUM(tr.unit_price_snapshot) AS CHAR) AS amount
        FROM TourReservation tr
        JOIN TourRound round_data ON round_data.tour_round_id = tr.tour_round_id
        JOIN Service s ON s.service_id = round_data.service_id
        WHERE tr.booking_id = ? AND tr.status <> 'CANCELLED'
        GROUP BY tr.tour_round_id, s.name, location, round_data.tour_date,
                 round_data.start_time, tr.status
        ORDER BY round_data.tour_date, round_data.start_time, tr.tour_round_id
      `, [bookingId]).then(([rows]) => rows.map((row) => ({ ...row, roundId: Number(row.roundId), quantity: Number(row.quantity) }))),
      this.pool.execute(`
        SELECT bs.booking_service_id AS id, bs.service_id AS serviceId,
               s.name, s.service_kind AS serviceKind, bs.status,
               su.booking_room_id AS bookingRoomId, su.usage_date AS usageDate,
               TIME_FORMAT(su.start_time, '%H:%i:%s') AS startTime,
               CAST(CASE WHEN s.service_kind IN ('FITNESS', 'SAUNA')
                 THEN s.default_rate ELSE su.unit_price_snapshot END AS CHAR) AS unitPrice,
               su.quantity,
               CAST(CAST(CASE WHEN su.service_usage_id = (
                 SELECT MIN(first_usage.service_usage_id) FROM ServiceUsage first_usage
                 WHERE first_usage.booking_service_id = bs.booking_service_id
                   AND first_usage.status = 'ACTIVE'
               ) THEN (
                 SELECT COALESCE(SUM(charged.unit_price_snapshot * charged.quantity), 0)
                 FROM ServiceUsage charged
                 WHERE charged.booking_service_id = bs.booking_service_id
                   AND (charged.status = 'PASS_CHARGE'
                     OR (charged.status = 'ACTIVE' AND charged.unit_price_snapshot > 0))
               ) ELSE 0 END AS DECIMAL(12,2)) AS CHAR) AS amount
        FROM BookingService bs
        JOIN Service s ON s.service_id = bs.service_id
        LEFT JOIN ServiceUsage su ON su.booking_service_id = bs.booking_service_id
        WHERE bs.booking_id = ? AND su.status = 'ACTIVE'
        ORDER BY bs.booking_service_id, su.usage_date, su.booking_room_id
      `, [bookingId]).then(([rows]) => rows),
      this.pool.execute(`
        SELECT bp.sequence_no AS sequence, p.code,
               CAST(bp.percent_snapshot AS CHAR) AS percent,
               CAST(bp.base_amount_before AS CHAR) AS baseBefore,
               CAST(bp.discount_amount AS CHAR) AS discountAmount,
               CAST(bp.base_amount_after AS CHAR) AS baseAfter
        FROM BookingPromotion bp JOIN Promotion p ON p.promotion_id = bp.promotion_id
        WHERE bp.booking_id = ? ORDER BY bp.sequence_no
      `, [bookingId]).then(([rows]) => rows),
      this.pool.execute(`
        SELECT COALESCE(SUM(CASE
                 WHEN direction = 'IN' AND status IN ('VERIFIED', 'COMPLETED', 'APPROVED') THEN amount
                 WHEN direction = 'OUT' AND status IN ('VERIFIED', 'COMPLETED', 'APPROVED') THEN -amount
                 ELSE 0 END), 0) AS paid
        FROM Payment WHERE booking_id = ?
      `, [bookingId]).then(([rows]) => rows),
      this.pool.execute(`
        SELECT action, reason, created_at AS createdAt
        FROM AuditLog
        WHERE entity_type = 'Booking' AND entity_id = ?
        ORDER BY audit_log_id
      `, [bookingId]).then(([rows]) => rows),
      this.pool.execute(`
        SELECT review_id AS id, rating, content, status, created_at AS createdAt
        FROM Review WHERE booking_id = ? LIMIT 1
      `, [bookingId]).then(([rows]) => rows[0] ?? null),
      this.pool.execute(`
        SELECT payment_id AS id, related_payment_id AS sourcePaymentId,
               CAST(amount AS CHAR) AS amount, status, request_reason AS reason,
               requested_at AS requestedAt, approved_at AS approvedAt,
               rejection_reason AS rejectionReason, processed_at AS processedAt
        FROM Payment
        WHERE booking_id = ? AND transaction_type = 'REFUND_REQUEST'
        ORDER BY requested_at DESC, payment_id DESC
      `, [bookingId]).then(([rows]) => rows.map(row => ({
        ...row,
        id: Number(row.id),
        sourcePaymentId: Number(row.sourcePaymentId)
      })))
    ]);
    const paidCents = decimalToCents(String(paymentRows[0].paid));
    const totalCents = decimalToCents(booking.total);
    return {
      ...booking,
      rooms,
      services,
      tours,
      promotions,
      payment: {
        paid: centsToDecimal(paidCents),
        total: booking.total,
        outstanding: centsToDecimal(Math.max(0, totalCents - paidCents))
      },
      review,
      refunds,
      timeline
    };
  }

  async cancelMine(bookingId, customerId, reason) {
    return this.#customerTransition(bookingId, customerId, async (connection, before) => {
      if (before.status === "CANCELLED") return transitionResponse(before);
      if (!["PENDING_PAYMENT", "PAYMENT_REVIEW", "CONFIRMED", "LATE_ARRIVAL"].includes(before.status)) {
        throw new ApiError(409, "BOOKING_TRANSITION_INVALID", "Booking can no longer be cancelled");
      }
      if (before.checkIn <= bangkokDate(new Date())) {
        throw new ApiError(409, "BOOKING_TRANSITION_INVALID", "Booking can only be cancelled before arrival day");
      }
      const [pendingPayments] = before.status === "PAYMENT_REVIEW"
        ? await connection.execute(`
            SELECT payment_id AS id FROM Payment
            WHERE booking_id = ? AND status = 'SUBMITTED'
              AND transaction_type IN ('PAYMENT', 'DEPOSIT', 'FULL_PAYMENT')
            ORDER BY payment_id FOR UPDATE
          `, [bookingId])
        : [[]];
      await connection.execute(`
        UPDATE Booking
        SET status = 'CANCELLED', status_changed_at = CURRENT_TIMESTAMP
        WHERE booking_id = ?
      `, [bookingId]);
      const after = { ...transitionResponse(before), status: "CANCELLED" };
      await writeAudit(connection, {
        entityType: "Booking",
        entityId: bookingId,
        action: "BOOKING_CANCELLED",
        actor: { type: "customer", id: customerId },
        before: transitionResponse(before),
        after: {
          ...after,
          pendingPaymentIds: pendingPayments.map(payment => Number(payment.id))
        },
        reason
      });
      return after;
    });
  }

  async declareLateArrival(bookingId, customerId, expectedArrivalAt) {
    return this.#customerTransition(bookingId, customerId, async (connection, before) => {
      const requestedDate = bangkokDate(expectedArrivalAt);
      if (requestedDate < before.checkIn || requestedDate >= before.checkOut) {
        throw new ApiError(400, "ARRIVAL_OUTSIDE_STAY", "Expected arrival must be inside the booked stay");
      }
      if (before.status === "LATE_ARRIVAL") return transitionResponse(before);
      if (before.status !== "CONFIRMED") {
        throw new ApiError(409, "BOOKING_TRANSITION_INVALID", "Only a confirmed booking can declare late arrival");
      }
      await connection.execute(`
        UPDATE Booking
        SET status = 'LATE_ARRIVAL', expected_arrival_at = ?,
            status_changed_at = CURRENT_TIMESTAMP
        WHERE booking_id = ?
      `, [expectedArrivalAt, bookingId]);
      const after = {
        ...transitionResponse(before),
        status: "LATE_ARRIVAL",
        expectedArrivalAt
      };
      await writeAudit(connection, {
        entityType: "Booking",
        entityId: bookingId,
        action: "LATE_ARRIVAL_DECLARED",
        actor: { type: "customer", id: customerId },
        before: transitionResponse(before),
        after
      });
      return after;
    });
  }

  async #customerTransition(bookingId, customerId, transition) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(`
        SELECT booking_id AS id, booking_code AS bookingCode, status,
               DATE_FORMAT(check_in_date, '%Y-%m-%d') AS checkIn,
               DATE_FORMAT(check_out_date, '%Y-%m-%d') AS checkOut,
               expected_arrival_at AS expectedArrivalAt,
               hold_expires_at AS holdExpiresAt
        FROM Booking
        WHERE booking_id = ? AND customer_id = ?
        FOR UPDATE
      `, [bookingId, customerId]);
      const before = rows[0];
      if (!before) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
      const result = await transition(connection, before);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function transitionResponse(row) {
  return {
    id: Number(row.id),
    bookingCode: row.bookingCode,
    status: row.status,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    expectedArrivalAt: row.expectedArrivalAt,
    holdExpiresAt: row.holdExpiresAt
  };
}

function bangkokDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

async function assignPhysicalRooms(connection, bookingRooms, roomAssignments, input, actor) {
  const requested = roomAssignments.filter((roomId) => roomId != null);
  if (requested.length === 0) return;
  if (actor.type !== "employee" || roomAssignments.length !== bookingRooms.length) {
    throw new ApiError(400, "ROOM_ASSIGNMENT_INVALID", "Physical room assignments are invalid");
  }
  if (new Set(requested).size !== requested.length) {
    throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "A physical room cannot be assigned twice");
  }
  const lockIds = [...requested].sort((left, right) => left - right);
  const placeholders = lockIds.map(() => "?").join(", ");
  const [roomRows] = await connection.execute(`
    SELECT room_id AS id, room_type_id AS roomTypeId, current_status AS status
    FROM Room WHERE room_id IN (${placeholders}) ORDER BY room_id FOR UPDATE
  `, lockIds);
  const physicalRooms = new Map(roomRows.map((room) => [Number(room.id), {
    id: Number(room.id),
    roomTypeId: Number(room.roomTypeId),
    status: room.status
  }]));
  for (let index = 0; index < roomAssignments.length; index += 1) {
    const roomId = roomAssignments[index];
    if (roomId == null) continue;
    const physicalRoom = physicalRooms.get(roomId);
    const bookingRoom = bookingRooms[index];
    if (!physicalRoom || physicalRoom.roomTypeId !== bookingRoom.roomTypeId) {
      throw new ApiError(400, "ROOM_ASSIGNMENT_INVALID", "Assigned room does not match the selected room type");
    }
    if (physicalRoom.status !== "AVAILABLE") {
      throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "Assigned room is not currently available");
    }
    const [[overlap]] = await connection.execute(`
      SELECT COUNT(*) AS count
      FROM RoomAssignment ra
      JOIN BookingRoom br ON br.booking_room_id = ra.booking_room_id
      JOIN Booking b ON b.booking_id = br.booking_id
      WHERE ra.room_id = ?
        AND ra.effective_from < ?
        AND COALESCE(ra.effective_to, '9999-12-31 23:59:59') > ?
        AND b.status IN ('CONFIRMED', 'CHECKED_IN', 'LATE_ARRIVAL')
    `, [roomId, input.checkOut, input.checkIn]);
    if (Number(overlap.count) > 0) {
      throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "Assigned room is already occupied for this stay");
    }
    await connection.execute(`
      INSERT INTO RoomAssignment
        (booking_room_id, room_id, assigned_by, effective_from, effective_to, reason)
      VALUES (?, ?, ?, ?, ?, 'Walk-in assignment')
    `, [bookingRoom.id, roomId, actor.id, input.checkIn, input.checkOut]);
  }
}

async function resolveWalkInCustomer(connection, { customerId, customer }, employeeId) {
  await connection.execute("SELECT service_id FROM Service WHERE service_id = 1 FOR UPDATE");
  if (customerId) {
    const [rows] = await connection.execute(
      "SELECT customer_id AS id FROM Customer WHERE customer_id = ? AND active = TRUE FOR UPDATE",
      [customerId]
    );
    if (!rows[0]) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
    return Number(rows[0].id);
  }
  const [existing] = await connection.execute(`
    SELECT customer_id AS id FROM Customer
    WHERE identity_type = ? AND identity_number = ? AND active = TRUE
    ORDER BY customer_id LIMIT 1 FOR UPDATE
  `, [customer.identityType, customer.identityNumber]);
  if (existing[0]) return Number(existing[0].id);
  try {
    const [result] = await connection.execute(`
      INSERT INTO Customer
        (full_name, email, phone, identity_type, identity_number,
         password_hash, member_status, registered_at, active)
      VALUES (?, ?, ?, ?, ?, NULL, 'WALK_IN', NULL, TRUE)
    `, [
      customer.fullName,
      customer.email,
      customer.phone,
      customer.identityType,
      customer.identityNumber
    ]);
    await writeAudit(connection, {
      entityType: "Customer",
      entityId: result.insertId,
      action: "WALK_IN_CREATED",
      actor: { type: "employee", id: employeeId },
      after: { ...customer, id: Number(result.insertId), memberStatus: "WALK_IN" }
    });
    return Number(result.insertId);
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "CUSTOMER_EMAIL_IN_USE", "Customer email is already in use");
    }
    throw error;
  }
}

async function lockPromotions(connection, codes) {
  if (codes.length === 0) return [];
  const placeholders = codes.map(() => "?").join(", ");
  const [rows] = await connection.execute(`
    SELECT promotion_id AS id, UPPER(code) AS code,
           CAST(discount_percent AS CHAR) AS percent, priority
    FROM Promotion
    WHERE UPPER(code) IN (${placeholders})
      AND active = TRUE
      AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
      AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
    ORDER BY priority, promotion_id
    FOR UPDATE
  `, codes);
  if (rows.length !== codes.length) {
    throw new ApiError(400, "PROMOTION_INVALID", "One or more promotion codes are invalid or unavailable");
  }
  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    percent: row.percent,
    priority: Number(row.priority)
  }));
}

function countRequestedRooms(rooms) {
  const result = new Map();
  for (const room of rooms) {
    result.set(room.roomTypeId, (result.get(room.roomTypeId) ?? 0) + 1);
  }
  return result;
}

async function lockRoomTypes(connection, typeIds) {
  const placeholders = typeIds.map(() => "?").join(", ");
  const [rows] = await connection.execute(`
    SELECT room_type_id AS id, capacity,
           CAST(price_per_night AS CHAR) AS pricePerNight,
           CAST(breakfast_daily_rate AS CHAR) AS breakfastDailyRate
    FROM RoomType
    WHERE room_type_id IN (${placeholders})
    ORDER BY room_type_id
    FOR UPDATE
  `, typeIds);
  return new Map(rows.map((row) => [Number(row.id), { ...row, id: Number(row.id), capacity: Number(row.capacity) }]));
}

async function lockInventoryRooms(connection, typeIds) {
  const placeholders = typeIds.map(() => "?").join(", ");
  await connection.execute(`
    SELECT room_id
    FROM Room
    WHERE room_type_id IN (${placeholders})
    ORDER BY room_id
    FOR UPDATE
  `, typeIds);
}

function validateRoomSelections(rooms, roomTypes) {
  for (const room of rooms) {
    const roomType = roomTypes.get(room.roomTypeId);
    if (!roomType) throw new ApiError(404, "ROOM_TYPE_NOT_FOUND", "Room type was not found");
    if (room.guestCount > roomType.capacity) {
      throw new ApiError(400, "ROOM_CAPACITY_EXCEEDED", "Guest count exceeds room capacity");
    }
  }
}

async function ensureInventory(connection, input, requestedByType, roomTypes) {
  for (const [roomTypeId, requested] of requestedByType) {
    const [[inventory]] = await connection.execute(`
      SELECT
        (SELECT COUNT(*) FROM Room WHERE room_type_id = ?) AS totalRooms,
        (SELECT COUNT(*)
         FROM BookingRoom br JOIN Booking b ON b.booking_id = br.booking_id
         WHERE br.room_type_id = ?
           AND b.check_in_date < ? AND b.check_out_date > ?
           AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
                OR b.status IN ('PAYMENT_REVIEW', 'CONFIRMED', 'CHECKED_IN', 'LATE_ARRIVAL'))) AS reservedRooms,
        (SELECT COUNT(DISTINCT blocked.room_id)
         FROM (
           SELECT close_event.room_id
           FROM RoomEvent close_event
           WHERE close_event.event_type = 'ROOM_CLOSED'
             AND COALESCE(close_event.effective_from, close_event.created_at) < ?
             AND COALESCE(close_event.effective_to, '9999-12-31 23:59:59') > ?
             AND NOT EXISTS (
               SELECT 1 FROM RoomEvent reopen
               WHERE reopen.related_event_id = close_event.room_event_id
                 AND reopen.event_type = 'ROOM_REOPENED'
                 AND COALESCE(reopen.effective_from, reopen.created_at) <= ?
             )
           UNION
           SELECT queued.room_id
           FROM RoomEvent queued
           WHERE queued.event_type = 'CLEANING_QUEUED'
             AND NOT EXISTS (
               SELECT 1 FROM RoomEvent done
               WHERE done.related_event_id = queued.room_event_id
                 AND done.event_type = 'CLEANING_COMPLETED'
             )
         ) blocked
         JOIN Room blocked_room ON blocked_room.room_id = blocked.room_id
         WHERE blocked_room.room_type_id = ?) AS blockedRooms
    `, [
      roomTypeId,
      roomTypeId,
      input.checkOut,
      input.checkIn,
      input.checkOut,
      input.checkIn,
      input.checkIn,
      roomTypeId
    ]);
    const available = Number(inventory.totalRooms)
      - Number(inventory.reservedRooms)
      - Number(inventory.blockedRooms);
    if (available < requested) {
      throw new ApiError(409, "ROOM_INVENTORY_UNAVAILABLE", "Requested room inventory is no longer available", {
        roomTypeId,
        available: Math.max(0, available),
        requested
      });
    }
    if (!roomTypes.has(roomTypeId)) {
      throw new ApiError(404, "ROOM_TYPE_NOT_FOUND", "Room type was not found");
    }
  }
}

function calculateBooking(input, roomTypes, promotionRecords) {
  let roomSubtotalCents = 0;
  let serviceSubtotalCents = 0;
  for (const room of input.rooms) {
    const roomType = roomTypes.get(room.roomTypeId);
    roomSubtotalCents = addMoney(
      roomSubtotalCents,
      multiplyMoney(decimalToCents(roomType.pricePerNight), input.nights)
    );
    serviceSubtotalCents = addMoney(
      serviceSubtotalCents,
      multiplyMoney(decimalToCents(roomType.breakfastDailyRate), input.breakfastDates.length)
    );
  }
  let discountedRoomCents = roomSubtotalCents;
  const promotions = promotionRecords.map((promotion, index) => {
    const baseBeforeCents = discountedRoomCents;
    const discountCents = Math.min(
      baseBeforeCents,
      percentageOfCents(baseBeforeCents, promotion.percent)
    );
    discountedRoomCents -= discountCents;
    return {
      id: promotion.id,
      code: promotion.code,
      sequence: index + 1,
      percent: promotion.percent,
      baseBefore: centsToDecimal(baseBeforeCents),
      discountAmount: centsToDecimal(discountCents),
      baseAfter: centsToDecimal(discountedRoomCents)
    };
  });
  const discountTotalCents = roomSubtotalCents - discountedRoomCents;
  const totalCents = addMoney(discountedRoomCents, serviceSubtotalCents);
  const depositRate = input.paymentChoice === "full"
    ? "100.00"
    : input.rooms.length > 1 ? "40.00" : "20.00";
  return {
    roomSubtotalCents,
    serviceSubtotalCents,
    discountTotalCents,
    totalCents,
    depositRate,
    paymentDueCents: totalCents === 0
      ? 0
      : Math.max(1, percentageOfCents(totalCents, depositRate)),
    promotions
  };
}

function multiplyMoney(cents, quantity) {
  const result = BigInt(cents) * BigInt(quantity);
  if (result > BigInt(MAX_MONEY_CENTS)) amountTooLarge();
  return Number(result);
}

function addMoney(left, right) {
  const result = BigInt(left) + BigInt(right);
  if (result > BigInt(MAX_MONEY_CENTS)) amountTooLarge();
  return Number(result);
}

function amountTooLarge() {
  throw new ApiError(400, "BOOKING_AMOUNT_TOO_LARGE", "Booking amount exceeds the supported limit");
}

function createBookingCode() {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TKC-${time}-${random}`;
}
