import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { centsToDecimal, decimalToCents } from "../bookings/money.js";

export class ServicesRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async list() {
    const [rows] = await this.pool.execute(`
      SELECT service_id AS id, name, service_kind AS serviceKind, description,
             image_reference AS imageReference, schedule_json AS schedule,
             charge_unit AS chargeUnit, CAST(default_rate AS CHAR) AS defaultRate,
             included_in_room AS includedInRoom
      FROM Service
      WHERE active = TRUE AND visible = TRUE
        AND service_kind NOT IN ('TOUR', 'ATTRACTION')
      ORDER BY service_id
    `);
    return rows.map((row) => ({ ...row, id: Number(row.id), includedInRoom: Boolean(row.includedInRoom) }));
  }

  async listRounds(serviceId, bookingRoomId, date, customerId) {
    const [bookingRows] = await this.pool.execute(`
      SELECT b.status, b.hold_expires_at AS holdExpiresAt,
             DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut
      FROM BookingRoom br JOIN Booking b ON b.booking_id = br.booking_id
      WHERE br.booking_room_id = ? AND b.customer_id = ?
      LIMIT 1
    `, [bookingRoomId, customerId]);
    const booking = bookingRows[0];
    if (!booking) throw new ApiError(404, "BOOKING_ROOM_NOT_FOUND", "Booked room was not found");
    if (!eligibleCustomerService(booking)) {
      throw new ApiError(409, "BOOKING_SERVICE_STATE_INVALID", "Booking cannot add a service");
    }
    if (date < booking.checkIn || date >= booking.checkOut) {
      throw new ApiError(400, "SERVICE_DATE_INVALID", "Service date must be inside the stay");
    }
    const [serviceRows] = await this.pool.execute(`
      SELECT service_id AS id, schedule_json AS schedule
      FROM Service
      WHERE service_id = ? AND active = TRUE AND visible = TRUE
        AND service_kind IN ('FITNESS', 'SAUNA')
      LIMIT 1
    `, [serviceId]);
    const service = serviceRows[0];
    if (!service) throw new ApiError(404, "SERVICE_NOT_FOUND", "Service was not found");
    const schedule = parseSchedule(service.schedule);
    const [reservedRows] = await this.pool.execute(`
      SELECT TIME_FORMAT(su.start_time, '%H:%i:%s') AS startTime,
             SUM(su.quantity) AS reserved
      FROM ServiceUsage su
      JOIN BookingService bs ON bs.booking_service_id = su.booking_service_id
      JOIN Booking b ON b.booking_id = bs.booking_id
      WHERE bs.service_id = ? AND bs.status = 'SELECTED'
        AND su.usage_date = ? AND su.status = 'ACTIVE'
        AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
          OR b.status IN ('PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN'))
      GROUP BY su.start_time
    `, [serviceId, date]);
    const reservedByTime = new Map(reservedRows.map((row) => [row.startTime, Number(row.reserved)]));
    return schedule.times.map((value) => {
      const startTime = normalizeTime(value);
      const reserved = reservedByTime.get(startTime) || 0;
      const capacity = Number.isSafeInteger(schedule.capacity) ? schedule.capacity : null;
      return {
        startTime, capacity, reserved,
        remaining: capacity == null ? null : Math.max(0, capacity - reserved)
      };
    });
  }

  async addCustomer(bookingId, customerId, input) {
    return this.#transaction(async (connection) => {
      const booking = await lockOwnedBooking(connection, bookingId, customerId);
      if (!eligibleCustomerService(booking)) {
        throw new ApiError(409, "BOOKING_SERVICE_STATE_INVALID", "Services can only be added before Check-in");
      }
      const result = await createService(connection, booking, input, null);
      await addBookingAmount(connection, bookingId, result.amountCents);
      await writeAudit(connection, {
        entityType: "BookingService", entityId: result.data.id,
        action: "BOOKING_SERVICE_ADDED", actor: { type: "customer", id: customerId },
        after: result.data
      });
      return result.data;
    });
  }

  async cancelCustomer(bookingId, bookingServiceId, customerId) {
    return this.#transaction(async (connection) => {
      const booking = await lockOwnedBooking(connection, bookingId, customerId);
      if (!["CONFIRMED", "LATE_ARRIVAL"].includes(booking.status)) {
        throw new ApiError(409, "BOOKING_SERVICE_STATE_INVALID", "Service can no longer be cancelled");
      }
      const [rows] = await connection.execute(`
        SELECT bs.booking_service_id AS id, bs.status,
               COALESCE(SUM(su.unit_price_snapshot * su.quantity), 0) AS amount
        FROM BookingService bs
        LEFT JOIN ServiceUsage su ON su.booking_service_id = bs.booking_service_id
        WHERE bs.booking_service_id = ? AND bs.booking_id = ?
        GROUP BY bs.booking_service_id, bs.status FOR UPDATE
      `, [bookingServiceId, bookingId]);
      const service = rows[0];
      if (!service) throw new ApiError(404, "BOOKING_SERVICE_NOT_FOUND", "Booking service was not found");
      const amountCents = decimalToCents(String(service.amount));
      if (service.status === "CANCELLED") {
        return { id: bookingServiceId, bookingId, status: "CANCELLED", amount: centsToDecimal(amountCents) };
      }
      if (service.status !== "SELECTED") {
        throw new ApiError(409, "BOOKING_SERVICE_STATE_INVALID", "Service can no longer be cancelled");
      }
      await connection.execute("UPDATE BookingService SET status = 'CANCELLED' WHERE booking_service_id = ?", [bookingServiceId]);
      await connection.execute("UPDATE ServiceUsage SET status = 'CANCELLED' WHERE booking_service_id = ?", [bookingServiceId]);
      await addBookingAmount(connection, bookingId, -amountCents);
      const response = { id: bookingServiceId, bookingId, status: "CANCELLED", amount: centsToDecimal(amountCents) };
      await writeAudit(connection, {
        entityType: "BookingService", entityId: bookingServiceId,
        action: "BOOKING_SERVICE_CANCELLED", actor: { type: "customer", id: customerId },
        before: { status: service.status }, after: response
      });
      return response;
    });
  }

  async addStaff(bookingId, employeeId, input) {
    return this.#transaction(async (connection) => {
      const [replayRows] = await connection.execute(`
        SELECT payment_id AS paymentId, booking_id AS bookingId, method,
               CAST(amount AS CHAR) AS amount, status, auto_check_result AS resultData
        FROM Payment WHERE idempotency_key = ? FOR UPDATE
      `, [input.idempotencyKey]);
      if (replayRows[0]) {
        const replay = replayRows[0];
        if (Number(replay.bookingId) !== bookingId || replay.method !== input.method
            || replay.status !== "VERIFIED") {
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for different input");
        }
        let stored;
        try { stored = JSON.parse(replay.resultData); } catch { stored = null; }
        if (!stored || stored.input?.serviceId !== input.serviceId
            || stored.input?.bookingRoomId !== input.bookingRoomId
            || stored.input?.quantity !== input.quantity
            || stored.input?.usageDate !== input.usageDate
            || stored.input?.startTime !== input.startTime) {
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was used for different input");
        }
        return { data: { ...stored.data, payment: { ...stored.data.payment, id: Number(replay.paymentId) } }, replayed: true };
      }
      const booking = await lockBooking(connection, bookingId);
      if (booking.status !== "CHECKED_IN") {
        throw new ApiError(409, "BOOKING_SERVICE_STATE_INVALID", "Staff paid services require a checked-in booking");
      }
      const result = await createService(connection, booking, input, employeeId);
      if (result.amountCents <= 0) {
        throw new ApiError(409, "SERVICE_NO_CHARGE", "This service does not require a post-Check-in payment");
      }
      await addBookingAmount(connection, bookingId, result.amountCents);
      const [payment] = await connection.execute(`
        INSERT INTO Payment
          (booking_id, transaction_type, direction, verified_by, method, amount,
           status, submitted_at, verified_at, idempotency_key)
        VALUES (?, 'SERVICE_PAYMENT', 'IN', ?, ?, ?, 'VERIFIED',
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      `, [bookingId, employeeId, input.method, result.data.amount, input.idempotencyKey]);
      const data = {
        ...result.data,
        payment: {
          id: Number(payment.insertId), transactionType: "SERVICE_PAYMENT",
          amount: result.data.amount, method: input.method, status: "VERIFIED"
        }
      };
      await connection.execute(
        "UPDATE Payment SET auto_check_result = ? WHERE payment_id = ?",
        [JSON.stringify({ input, data }), payment.insertId]
      );
      await writeAudit(connection, {
        entityType: "BookingService", entityId: data.id,
        action: "POST_CHECK_IN_SERVICE_ADDED", actor: { type: "employee", id: employeeId }, after: data
      });
      await writeAudit(connection, {
        entityType: "Payment", entityId: payment.insertId,
        action: "SERVICE_PAYMENT_RECEIVED", actor: { type: "employee", id: employeeId }, after: data.payment
      });
      return { data, replayed: false };
    });
  }

  async #transaction(work) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "SERVICE_CONFLICT", "Service request conflicts with an existing record");
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}

async function lockOwnedBooking(connection, bookingId, customerId) {
  const booking = await lockBooking(connection, bookingId, " AND customer_id = ?", [customerId]);
  if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  return booking;
}

async function lockBooking(connection, bookingId, extra = "", values = []) {
  const [rows] = await connection.execute(`
    SELECT booking_id AS id, customer_id AS customerId, status, hold_expires_at AS holdExpiresAt,
           DATE_FORMAT(check_in_date, '%Y-%m-%d') AS checkIn,
           DATE_FORMAT(check_out_date, '%Y-%m-%d') AS checkOut
    FROM Booking WHERE booking_id = ?${extra} FOR UPDATE
  `, [bookingId, ...values]);
  if (!rows[0] && !extra) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  return rows[0] ? { ...rows[0], id: Number(rows[0].id), customerId: Number(rows[0].customerId) } : null;
}

async function createService(connection, booking, input, employeeId) {
  const [roomRows] = await connection.execute(`
    SELECT br.booking_room_id AS id, br.room_type_id AS roomTypeId, br.guest_count AS guestCount,
           CAST(rt.breakfast_daily_rate AS CHAR) AS breakfastRate
    FROM BookingRoom br JOIN RoomType rt ON rt.room_type_id = br.room_type_id
    WHERE br.booking_room_id = ? AND br.booking_id = ? FOR UPDATE
  `, [input.bookingRoomId, booking.id]);
  const bookingRoom = roomRows[0];
  if (!bookingRoom) throw new ApiError(404, "BOOKING_ROOM_NOT_FOUND", "Booked room was not found");
  const [serviceRows] = await connection.execute(`
    SELECT service_id AS id, name, service_kind AS serviceKind, charge_unit AS chargeUnit,
           CAST(default_rate AS CHAR) AS defaultRate, included_in_room AS includedInRoom,
           schedule_json AS schedule
    FROM Service WHERE service_id = ? AND active = TRUE FOR UPDATE
  `, [input.serviceId]);
  const service = serviceRows[0];
  if (!service || ["TOUR", "ATTRACTION"].includes(service.serviceKind)) {
    throw new ApiError(404, "SERVICE_NOT_FOUND", "Service was not found");
  }
  if (employeeId == null) {
    if (!input.usageDate || !input.startTime) {
      throw new ApiError(400, "SERVICE_ROUND_INVALID", "Service date and round are required");
    }
    const schedule = parseSchedule(service.schedule);
    if (!schedule.times.map(normalizeTime).includes(input.startTime)) {
      throw new ApiError(400, "SERVICE_ROUND_INVALID", "Service round is not available");
    }
    if (input.quantity > Number(bookingRoom.guestCount)) {
      throw new ApiError(400, "SERVICE_PARTY_TOO_LARGE", "Party exceeds the booked guest count");
    }
    if (Number.isSafeInteger(schedule.capacity)) {
      const [[usage]] = await connection.execute(`
        SELECT COALESCE(SUM(su.quantity), 0) AS reserved
        FROM ServiceUsage su
        JOIN BookingService bs ON bs.booking_service_id = su.booking_service_id
        JOIN Booking b ON b.booking_id = bs.booking_id
        WHERE bs.service_id = ? AND bs.status = 'SELECTED'
          AND su.usage_date = ? AND su.start_time = ? AND su.status = 'ACTIVE'
          AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
            OR b.status IN ('PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN'))
      `, [input.serviceId, input.usageDate, input.startTime]);
      if (Number(usage.reserved) + input.quantity > schedule.capacity) {
        throw new ApiError(409, "SERVICE_CAPACITY_FULL", "Service round has insufficient capacity");
      }
    }
  }
  if (["PER_ROOM_PER_STAY", "PER_ROOM_PER_DAY", "INCLUDED"].includes(service.chargeUnit)
      && input.quantity !== 1) {
    throw new ApiError(400, "SERVICE_QUANTITY_INVALID", "This service is charged once per room selection");
  }
  if (service.serviceKind === "BREAKFAST") {
    if (!input.usageDate || input.usageDate < booking.checkIn || input.usageDate >= booking.checkOut) {
      throw new ApiError(400, "SERVICE_DATE_INVALID", "Breakfast date must be inside the stay");
    }
  } else if (input.usageDate && (input.usageDate < booking.checkIn || input.usageDate >= booking.checkOut)) {
    throw new ApiError(400, "SERVICE_DATE_INVALID", "Service date must be inside the stay");
  }
  const [[duplicate]] = await connection.execute(`
    SELECT COUNT(*) AS count
    FROM BookingService bs JOIN ServiceUsage su ON su.booking_service_id = bs.booking_service_id
    WHERE bs.booking_id = ? AND bs.service_id = ? AND bs.status = 'SELECTED'
      AND su.booking_room_id = ? AND su.status = 'ACTIVE'
      AND (su.usage_date <=> ?) AND (su.start_time <=> ?)
  `, [booking.id, input.serviceId, input.bookingRoomId, input.usageDate, input.startTime]);
  if (Number(duplicate.count) > 0) {
    throw new ApiError(409, "BOOKING_SERVICE_DUPLICATE", "Service is already selected for this room and date");
  }
  const unitPrice = service.serviceKind === "BREAKFAST" ? bookingRoom.breakfastRate : service.defaultRate;
  const amountCents = multiply(decimalToCents(unitPrice), input.quantity);
  const [bookingService] = await connection.execute(`
    INSERT INTO BookingService (booking_id, service_id, added_by, status)
    VALUES (?, ?, ?, 'SELECTED')
  `, [booking.id, input.serviceId, employeeId]);
  const [usage] = await connection.execute(`
    INSERT INTO ServiceUsage
      (booking_service_id, booking_room_id, usage_date, start_time, unit_price_snapshot, quantity, status)
    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
  `, [bookingService.insertId, input.bookingRoomId, input.usageDate, input.startTime, unitPrice, input.quantity]);
  return {
    amountCents,
    data: {
      id: Number(bookingService.insertId), usageId: Number(usage.insertId), bookingId: booking.id,
      serviceId: Number(service.id), serviceName: service.name, serviceKind: service.serviceKind,
      bookingRoomId: input.bookingRoomId, usageDate: input.usageDate,
      startTime: input.startTime, quantity: input.quantity,
      unitPrice, amount: centsToDecimal(amountCents), status: "SELECTED"
    }
  };
}

async function addBookingAmount(connection, bookingId, amountCents) {
  const amount = centsToDecimal(Math.abs(amountCents));
  const operator = amountCents >= 0 ? "+" : "-";
  await connection.execute(`
    UPDATE Booking
    SET service_subtotal_snapshot = service_subtotal_snapshot ${operator} ?,
        total_snapshot = total_snapshot ${operator} ?
    WHERE booking_id = ?
  `, [amount, amount, bookingId]);
}

function multiply(cents, quantity) {
  const value = BigInt(cents) * BigInt(quantity);
  if (value > 999999999999n) throw new ApiError(400, "SERVICE_AMOUNT_TOO_LARGE", "Service amount is too large");
  return Number(value);
}

function eligibleCustomerService(booking) {
  return (booking.status === "PENDING_PAYMENT"
      && new Date(booking.holdExpiresAt).valueOf() > Date.now())
    || ["CONFIRMED", "LATE_ARRIVAL"].includes(booking.status);
}

function parseSchedule(value) {
  const schedule = typeof value === "string" ? JSON.parse(value) : value;
  if (!schedule || !Array.isArray(schedule.times)) {
    throw new ApiError(409, "SERVICE_SCHEDULE_INVALID", "Service schedule is not configured");
  }
  return schedule;
}

function normalizeTime(value) {
  const text = String(value);
  return text.length === 5 ? `${text}:00` : text;
}
