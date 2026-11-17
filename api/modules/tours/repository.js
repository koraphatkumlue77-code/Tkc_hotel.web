// SQL สำหรับ TourRound/TourReservation; การจองและยกเลิกรอบล็อกจำนวนที่นั่งใน transaction
import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { centsToDecimal, decimalToCents } from "../bookings/money.js";
import { randomUUID } from "node:crypto";

export class ToursRepository {
  constructor(pool) { this.pool = pool; }

  async listRounds({ from, to }) {
    await this.ensureScheduledRounds(from, to);
    const [rows] = await this.pool.execute(`
      SELECT tr.tour_round_id AS id, tr.service_id AS serviceId, s.name,
             DATE_FORMAT(tr.tour_date, '%Y-%m-%d') AS tourDate,
             TIME_FORMAT(tr.start_time, '%H:%i:%s') AS startTime,
             tr.capacity, tr.status, CAST(s.default_rate AS CHAR) AS baseRate,
             tr.capacity - (
               SELECT COUNT(*) FROM TourReservation reservation
               JOIN Booking b ON b.booking_id = reservation.booking_id
               WHERE reservation.tour_round_id = tr.tour_round_id
                 AND reservation.status <> 'CANCELLED'
                 AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
                   OR b.status IN ('PAYMENT_REVIEW','CONFIRMED','LATE_ARRIVAL','CHECKED_IN'))
             ) AS remainingSeats
      FROM TourRound tr JOIN Service s ON s.service_id = tr.service_id
      WHERE tr.tour_date BETWEEN ? AND ? AND tr.status = 'OPEN' AND s.active = TRUE AND s.visible = TRUE
      ORDER BY tr.tour_date, tr.start_time, tr.tour_round_id
    `, [from, to]);
    return rows.map(roundRecord);
  }

  async ensureScheduledRounds(from, to) {
    const [services] = await this.pool.execute(`
      SELECT service_id AS id, schedule_json AS schedule
      FROM Service
      WHERE service_kind = 'TOUR' AND active = TRUE AND visible = TRUE
        AND schedule_json IS NOT NULL
      ORDER BY service_id
    `);
    const values = [];
    for (const service of services) {
      const schedule = typeof service.schedule === "string" ? JSON.parse(service.schedule) : service.schedule;
      if (!Array.isArray(schedule?.times) || !Number.isSafeInteger(schedule.capacity)) continue;
      for (const date of dateRange(from, to)) {
        for (const startTime of schedule.times) {
          values.push([Number(service.id), date, normalizeTime(startTime), schedule.capacity]);
        }
      }
    }
    if (!values.length) return;
    const placeholders = values.map(() => "(?, ?, ?, ?, 'OPEN', NULL)").join(", ");
    await this.pool.execute(`
      INSERT IGNORE INTO TourRound
        (service_id, tour_date, start_time, capacity, status, created_by)
      VALUES ${placeholders}
    `, values.flat());
  }

  async saveRound(id, input, employeeId) {
    return this.#transaction(async (connection) => {
      const [services] = await connection.execute("SELECT service_id AS id FROM Service WHERE service_id = ? AND service_kind = 'TOUR' AND active = TRUE FOR UPDATE", [input.serviceId]);
      if (!services[0]) throw new ApiError(404, "TOUR_SERVICE_NOT_FOUND", "Tour service was not found");
      let resultId = id; let before = null;
      if (id) {
        const existing = await lockRound(connection, id); before = roundRecord(existing);
        const [[used]] = await connection.execute("SELECT COUNT(*) AS count FROM TourReservation WHERE tour_round_id = ? AND status <> 'CANCELLED'", [id]);
        if (input.capacity < Number(used.count)) throw new ApiError(409, "TOUR_CAPACITY_BELOW_RESERVED", "Capacity cannot be lower than reservations");
        await connection.execute("UPDATE TourRound SET service_id = ?, tour_date = ?, start_time = ?, capacity = ?, status = ? WHERE tour_round_id = ?", [input.serviceId, input.tourDate, input.startTime, input.capacity, input.status, id]);
      } else {
        const [result] = await connection.execute("INSERT INTO TourRound (service_id, tour_date, start_time, capacity, status, created_by) VALUES (?, ?, ?, ?, ?, ?)", [input.serviceId, input.tourDate, input.startTime, input.capacity, input.status, employeeId]);
        resultId = Number(result.insertId);
      }
      const after = roundRecord(await lockRound(connection, resultId));
      await writeAudit(connection, { entityType: "TourRound", entityId: resultId, action: id ? "TOUR_ROUND_UPDATED" : "TOUR_ROUND_CREATED", actor: { type: "employee", id: employeeId }, before, after });
      return after;
    });
  }

  async add(bookingId, customerId, input) {
    return this.#transaction(async (connection) => {
      const [bookingRows] = await connection.execute(`
        SELECT booking_id AS id, status, DATE_FORMAT(check_in_date, '%Y-%m-%d') AS checkIn,
               DATE_FORMAT(check_out_date, '%Y-%m-%d') AS checkOut, hold_expires_at AS holdExpiresAt
        FROM Booking WHERE booking_id = ? AND customer_id = ? FOR UPDATE
      `, [bookingId, customerId]);
      const booking = bookingRows[0];
      if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
      if (!eligibleBooking(booking)) throw new ApiError(409, "TOUR_BOOKING_STATE_INVALID", "Booking cannot add a tour");
      const round = await lockRound(connection, input.tourRoundId);
      if (round.status !== "OPEN") throw new ApiError(409, "TOUR_ROUND_CLOSED", "Tour round is not open");
      if (round.tourDate < booking.checkIn || round.tourDate >= booking.checkOut) throw new ApiError(400, "TOUR_DATE_OUTSIDE_STAY", "Tour date must be inside the stay");
      const [[used]] = await connection.execute(`
        SELECT COUNT(*) AS count FROM TourReservation reservation
        JOIN Booking b ON b.booking_id = reservation.booking_id
        WHERE reservation.tour_round_id = ? AND reservation.status <> 'CANCELLED'
          AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
            OR b.status IN ('PAYMENT_REVIEW','CONFIRMED','LATE_ARRIVAL','CHECKED_IN'))
      `, [input.tourRoundId]);
      if (Number(used.count) >= round.capacity) throw new ApiError(409, "TOUR_CAPACITY_FULL", "Tour round has no remaining seats");
      const [[uses]] = await connection.execute(`
        SELECT COUNT(*) AS count FROM TourReservation reservation
        JOIN TourRound other_round ON other_round.tour_round_id = reservation.tour_round_id
        JOIN Booking b ON b.booking_id = reservation.booking_id
        WHERE reservation.participant_code = ? AND other_round.tour_date = ?
          AND reservation.status <> 'CANCELLED'
          AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
            OR b.status IN ('PAYMENT_REVIEW','CONFIRMED','LATE_ARRIVAL','CHECKED_IN'))
      `, [input.participantCode, round.tourDate]);
      const sequence = Number(uses.count) + 1;
      const unitPriceCents = decimalToCents(round.baseRate) * sequence;
      const unitPrice = centsToDecimal(unitPriceCents);
      const reservationStatus = booking.status === "PENDING_PAYMENT" ? "PENDING_PAYMENT" : "CONFIRMED";
      const [result] = await connection.execute(`
        INSERT INTO TourReservation
          (booking_id, tour_round_id, participant_code, participant_name,
           usage_sequence_for_day, unit_price_snapshot, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [bookingId, input.tourRoundId, input.participantCode, input.participantName, sequence, unitPrice, reservationStatus]);
      await addAmount(connection, bookingId, unitPriceCents);
      const response = { id: Number(result.insertId), bookingId, tourRoundId: input.tourRoundId,
        participantCode: input.participantCode, participantName: input.participantName,
        usageSequenceForDay: sequence, unitPrice, status: reservationStatus };
      await writeAudit(connection, { entityType: "TourReservation", entityId: response.id, action: "TOUR_PARTICIPANT_ADDED", actor: { type: "customer", id: customerId }, after: response });
      return response;
    });
  }

  async addParty(bookingId, customerId, input) {
    return this.#transaction(async (connection) => {
      const [bookingRows] = await connection.execute(`
        SELECT b.booking_id AS id, b.status,
               DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
               DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
               b.hold_expires_at AS holdExpiresAt, br.guest_count AS guestCount
        FROM Booking b JOIN BookingRoom br ON br.booking_id = b.booking_id
        WHERE b.booking_id = ? AND b.customer_id = ? AND br.booking_room_id = ?
        FOR UPDATE
      `, [bookingId, customerId, input.bookingRoomId]);
      const booking = bookingRows[0];
      if (!booking) throw new ApiError(404, "BOOKING_ROOM_NOT_FOUND", "Booked room was not found");
      if (!eligibleBooking(booking)) throw new ApiError(409, "TOUR_BOOKING_STATE_INVALID", "Booking cannot add a tour");
      if (input.quantity > Number(booking.guestCount)) {
        throw new ApiError(400, "TOUR_PARTY_TOO_LARGE", "Party exceeds the booked guest count");
      }
      const round = await lockRound(connection, input.tourRoundId);
      if (round.status !== "OPEN") throw new ApiError(409, "TOUR_ROUND_CLOSED", "Tour round is not open");
      if (round.tourDate < booking.checkIn || round.tourDate >= booking.checkOut) {
        throw new ApiError(400, "TOUR_DATE_OUTSIDE_STAY", "Tour date must be inside the stay");
      }
      if (decimalToCents(round.baseRate) !== 0) {
        throw new ApiError(409, "TOUR_PAYMENT_NOT_SUPPORTED", "Customer tours must be free");
      }
      const [[used]] = await connection.execute(`
        SELECT COUNT(*) AS count FROM TourReservation reservation
        JOIN Booking b ON b.booking_id = reservation.booking_id
        WHERE reservation.tour_round_id = ? AND reservation.status <> 'CANCELLED'
          AND ((b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
            OR b.status IN ('PAYMENT_REVIEW','CONFIRMED','LATE_ARRIVAL','CHECKED_IN'))
      `, [input.tourRoundId]);
      if (Number(used.count) + input.quantity > round.capacity) {
        throw new ApiError(409, "TOUR_CAPACITY_FULL", "Tour round has insufficient remaining seats");
      }
      const status = booking.status === "PENDING_PAYMENT" ? "PENDING_PAYMENT" : "CONFIRMED";
      const reservations = [];
      for (let index = 0; index < input.quantity; index += 1) {
        const participantCode = `WEB-${randomUUID()}`.toUpperCase();
        const [result] = await connection.execute(`
          INSERT INTO TourReservation
            (booking_id, tour_round_id, participant_code, participant_name,
             usage_sequence_for_day, unit_price_snapshot, status)
          VALUES (?, ?, ?, NULL, 1, 0.00, ?)
        `, [bookingId, input.tourRoundId, participantCode, status]);
        const reservation = {
          id: Number(result.insertId), participantCode, status, unitPrice: "0.00"
        };
        reservations.push(reservation);
        await writeAudit(connection, {
          entityType: "TourReservation", entityId: reservation.id,
          action: "TOUR_PARTICIPANT_ADDED", actor: { type: "customer", id: customerId },
          after: { ...reservation, bookingId, tourRoundId: input.tourRoundId }
        });
      }
      return {
        bookingId, tourRoundId: input.tourRoundId, bookingRoomId: input.bookingRoomId,
        quantity: input.quantity, reservations, amount: "0.00", status
      };
    });
  }

  async cancel(bookingId, reservationId, customerId) {
    return this.#transaction(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT reservation.tour_reservation_id AS id, reservation.status,
               CAST(reservation.unit_price_snapshot AS CHAR) AS unitPrice,
               b.status AS bookingStatus, b.hold_expires_at AS holdExpiresAt
        FROM TourReservation reservation JOIN Booking b ON b.booking_id = reservation.booking_id
        WHERE reservation.tour_reservation_id = ? AND reservation.booking_id = ? AND b.customer_id = ? FOR UPDATE
      `, [reservationId, bookingId, customerId]);
      const reservation = rows[0];
      if (!reservation) throw new ApiError(404, "TOUR_RESERVATION_NOT_FOUND", "Tour reservation was not found");
      if (reservation.status === "CANCELLED") return { id: reservationId, bookingId, status: "CANCELLED", unitPrice: reservation.unitPrice };
      if (!eligibleBooking({ status: reservation.bookingStatus, holdExpiresAt: reservation.holdExpiresAt })) {
        throw new ApiError(409, "TOUR_BOOKING_STATE_INVALID", "Tour can no longer be cancelled");
      }
      await connection.execute("UPDATE TourReservation SET status = 'CANCELLED' WHERE tour_reservation_id = ?", [reservationId]);
      await addAmount(connection, bookingId, -decimalToCents(reservation.unitPrice));
      const response = { id: reservationId, bookingId, status: "CANCELLED", unitPrice: reservation.unitPrice };
      await writeAudit(connection, { entityType: "TourReservation", entityId: reservationId, action: "TOUR_PARTICIPANT_CANCELLED", actor: { type: "customer", id: customerId }, before: reservation, after: response });
      return response;
    });
  }

  async #transaction(work) {
    const connection = await this.pool.getConnection();
    try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); if (error?.code === "ER_DUP_ENTRY") throw new ApiError(409, "TOUR_CONFLICT", "Tour record already exists"); throw error; }
    finally { connection.release(); }
  }
}

async function lockRound(connection, id) {
  const [rows] = await connection.execute(`SELECT tr.tour_round_id AS id, tr.service_id AS serviceId,
    DATE_FORMAT(tr.tour_date, '%Y-%m-%d') AS tourDate, TIME_FORMAT(tr.start_time, '%H:%i:%s') AS startTime,
    tr.capacity, tr.status, CAST(s.default_rate AS CHAR) AS baseRate
    FROM TourRound tr JOIN Service s ON s.service_id = tr.service_id WHERE tr.tour_round_id = ? FOR UPDATE`, [id]);
  if (!rows[0]) throw new ApiError(404, "TOUR_ROUND_NOT_FOUND", "Tour round was not found"); return rows[0];
}
function roundRecord(row) { return { ...row, id: Number(row.id), serviceId: Number(row.serviceId), capacity: Number(row.capacity), remainingSeats: row.remainingSeats == null ? undefined : Math.max(0, Number(row.remainingSeats)) }; }
function eligibleBooking(booking) { return (booking.status === "PENDING_PAYMENT" && new Date(booking.holdExpiresAt).valueOf() > Date.now()) || ["PAYMENT_REVIEW","CONFIRMED","LATE_ARRIVAL","CHECKED_IN"].includes(booking.status); }
async function addAmount(connection, bookingId, cents) { const amount = centsToDecimal(Math.abs(cents)); const op = cents >= 0 ? "+" : "-"; await connection.execute(`UPDATE Booking SET service_subtotal_snapshot = service_subtotal_snapshot ${op} ?, total_snapshot = total_snapshot ${op} ? WHERE booking_id = ?`, [amount, amount, bookingId]); }

function dateRange(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function normalizeTime(value) {
  const text = String(value);
  return text.length === 5 ? `${text}:00` : text;
}
