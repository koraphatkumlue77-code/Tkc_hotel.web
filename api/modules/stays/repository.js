import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { centsToDecimal, decimalToCents } from "../bookings/money.js";

export class StaysRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async assign(bookingId, input, principal) {
    return this.#transaction(async (connection) => {
      const booking = await lockBooking(connection, bookingId);
      ensureAssignmentRole(booking, principal);
      if (!["CONFIRMED", "LATE_ARRIVAL"].includes(booking.status)) stateError("Booking cannot be assigned in its current state");
      const bookingRoom = await lockBookingRoom(connection, bookingId, input.bookingRoomId);
      const room = await lockRoom(connection, input.roomId);
      await validateTargetRoom(connection, booking, bookingRoom, room);

      const previous = await activeAssignment(connection, input.bookingRoomId);
      if (previous?.roomId === input.roomId) {
        return assignmentResponse(previous, booking, room, true);
      }
      if (previous) {
        await connection.execute(
          "UPDATE RoomAssignment SET effective_to = effective_from WHERE assignment_id = ?",
          [previous.id]
        );
      }
      const [result] = await connection.execute(`
        INSERT INTO RoomAssignment
          (booking_room_id, room_id, assigned_by, effective_from, effective_to, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [input.bookingRoomId, input.roomId, principal.id, booking.checkIn, booking.checkOut, input.reason]);
      const response = {
        assignmentId: Number(result.insertId),
        bookingId,
        bookingRoomId: input.bookingRoomId,
        roomId: input.roomId,
        roomCode: room.roomCode,
        effectiveFrom: booking.checkIn,
        effectiveTo: booking.checkOut,
        replayed: false
      };
      await writeAudit(connection, {
        entityType: "RoomAssignment", entityId: response.assignmentId,
        action: previous ? "ROOM_REASSIGNED" : "ROOM_ASSIGNED",
        actor: employeeActor(principal),
        before: previous,
        after: response,
        reason: input.reason
      });
      return response;
    });
  }

  async checkIn(bookingId, principal) {
    return this.#transaction(async (connection) => {
      const booking = await lockBooking(connection, bookingId);
      if (!["CONFIRMED", "LATE_ARRIVAL"].includes(booking.status)) stateError("Booking cannot be checked in");
      const today = bangkokDate(new Date());
      if (today < booking.checkIn || today >= booking.checkOut) {
        throw new ApiError(409, "CHECK_IN_DATE_INVALID", "Check-in is outside the booked stay");
      }
      const assignments = await lockActiveAssignments(connection, bookingId);
      if (assignments.length !== booking.roomCount) {
        throw new ApiError(409, "ROOM_ASSIGNMENT_INCOMPLETE", "Every booked room must be assigned before Check-in");
      }
      if (new Set(assignments.map(({ bookingRoomId }) => bookingRoomId)).size !== booking.roomCount) {
        throw new ApiError(409, "ROOM_ASSIGNMENT_INCOMPLETE", "Every booked room must have one assignment");
      }
      for (const assignment of assignments) {
        if (assignment.roomStatus !== "AVAILABLE") {
          throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "An assigned room is not available");
        }
      }
      const roomIds = assignments.map(({ roomId }) => roomId);
      await updateRoomStatuses(connection, roomIds, "OCCUPIED", principal.id, "Guest checked in");
      await connection.execute(`
        UPDATE Booking
        SET status = 'CHECKED_IN', status_changed_at = CURRENT_TIMESTAMP,
            status_changed_by = ?, actual_check_in_at = CURRENT_TIMESTAMP,
            checked_in_by = ?
        WHERE booking_id = ?
      `, [principal.id, principal.id, bookingId]);
      const response = { bookingId, bookingCode: booking.bookingCode, status: "CHECKED_IN", roomIds };
      await writeAudit(connection, {
        entityType: "Booking", entityId: bookingId, action: "CHECKED_IN",
        actor: employeeActor(principal), before: bookingState(booking), after: response
      });
      return response;
    });
  }

  async noShow(bookingId, input, principal) {
    return this.#transaction(async (connection) => {
      const booking = await lockBooking(connection, bookingId);
      if (!["CONFIRMED", "LATE_ARRIVAL"].includes(booking.status)) stateError("Booking cannot be marked No-show");
      if (bangkokDate(new Date()) < booking.checkIn) {
        throw new ApiError(409, "NO_SHOW_TOO_EARLY", "No-show cannot be recorded before arrival day");
      }
      if (booking.status === "LATE_ARRIVAL" && booking.expectedArrivalAt
          && new Date(booking.expectedArrivalAt).valueOf() > Date.now()) {
        throw new ApiError(409, "NO_SHOW_TOO_EARLY", "The declared late-arrival time has not passed");
      }
      await connection.execute(`
        UPDATE RoomAssignment ra
        JOIN BookingRoom br ON br.booking_room_id = ra.booking_room_id
        SET ra.effective_to = CASE
          WHEN ra.effective_from > CURRENT_TIMESTAMP THEN ra.effective_from
          ELSE CURRENT_TIMESTAMP END
        WHERE br.booking_id = ? AND ra.effective_to > ra.effective_from
      `, [bookingId]);
      await connection.execute(`
        UPDATE Booking SET status = 'NO_SHOW', status_changed_at = CURRENT_TIMESTAMP,
          status_changed_by = ? WHERE booking_id = ?
      `, [principal.id, bookingId]);
      const response = { bookingId, bookingCode: booking.bookingCode, status: "NO_SHOW" };
      await writeAudit(connection, {
        entityType: "Booking", entityId: bookingId, action: "NO_SHOW_RECORDED",
        actor: employeeActor(principal), before: bookingState(booking), after: response,
        reason: input.reason
      });
      return response;
    });
  }

  async requestEmergencyMove(bookingId, input, principal) {
    return this.#transaction(async (connection) => {
      const booking = await lockBooking(connection, bookingId);
      if (booking.status !== "CHECKED_IN") stateError("Emergency moves require a checked-in booking");
      const bookingRoom = await lockBookingRoom(connection, bookingId, input.bookingRoomId);
      const current = await activeAssignment(connection, input.bookingRoomId);
      if (!current) throw new ApiError(409, "ROOM_ASSIGNMENT_INCOMPLETE", "The occupied room assignment was not found");
      if (current.roomId === input.roomId) {
        throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "The target room is already assigned");
      }
      const room = await lockRoom(connection, input.roomId);
      await validateTargetRoom(connection, booking, bookingRoom, room);
      const [result] = await connection.execute(`
        INSERT INTO RoomAssignment
          (booking_room_id, room_id, assigned_by, effective_from, effective_to, reason)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      `, [input.bookingRoomId, input.roomId, principal.id, input.reason]);
      const response = {
        assignmentId: Number(result.insertId), bookingId,
        bookingRoomId: input.bookingRoomId, fromRoomId: current.roomId,
        requestedRoomId: input.roomId, requestedRoomCode: room.roomCode,
        status: "PENDING_APPROVAL"
      };
      await writeAudit(connection, {
        entityType: "RoomAssignment", entityId: response.assignmentId,
        action: "EMERGENCY_MOVE_REQUESTED", actor: employeeActor(principal),
        before: current, after: response, reason: input.reason
      });
      return response;
    });
  }

  async decideEmergencyMove(assignmentId, decision, input, principal) {
    return this.#transaction(async (connection) => {
      const [rows] = await connection.execute(`
        SELECT ra.assignment_id AS id, ra.booking_room_id AS bookingRoomId,
               ra.room_id AS roomId, ra.reason,
               br.booking_id AS bookingId, br.room_type_id AS roomTypeId,
               b.status AS bookingStatus, DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut
        FROM RoomAssignment ra
        JOIN BookingRoom br ON br.booking_room_id = ra.booking_room_id
        JOIN Booking b ON b.booking_id = br.booking_id
        WHERE ra.assignment_id = ? FOR UPDATE
      `, [assignmentId]);
      const request = rows[0];
      if (!request) throw new ApiError(404, "EMERGENCY_MOVE_NOT_FOUND", "Emergency move was not found");
      const [audits] = await connection.execute(`
        SELECT action FROM AuditLog
        WHERE entity_type = 'RoomAssignment' AND entity_id = ?
          AND action IN ('EMERGENCY_MOVE_REQUESTED', 'EMERGENCY_MOVE_APPROVED', 'EMERGENCY_MOVE_REJECTED')
        ORDER BY audit_log_id FOR UPDATE
      `, [assignmentId]);
      if (!audits.some(({ action }) => action === "EMERGENCY_MOVE_REQUESTED")) {
        throw new ApiError(404, "EMERGENCY_MOVE_NOT_FOUND", "Emergency move was not found");
      }
      if (audits.some(({ action }) => action !== "EMERGENCY_MOVE_REQUESTED")) {
        throw new ApiError(409, "EMERGENCY_MOVE_DECIDED", "Emergency move was already decided");
      }
      if (request.bookingStatus !== "CHECKED_IN") stateError("Emergency move booking is no longer checked in");
      if (decision === "REJECTED") {
        const response = { assignmentId, bookingId: Number(request.bookingId), status: "REJECTED" };
        await writeAudit(connection, {
          entityType: "RoomAssignment", entityId: assignmentId,
          action: "EMERGENCY_MOVE_REJECTED", actor: employeeActor(principal),
          after: response, reason: input.reason
        });
        return response;
      }

      const current = await activeAssignment(connection, Number(request.bookingRoomId));
      if (!current || current.id === assignmentId) {
        throw new ApiError(409, "ROOM_ASSIGNMENT_INCOMPLETE", "Current occupied room was not found");
      }
      const booking = await lockBooking(connection, Number(request.bookingId));
      const bookingRoom = await lockBookingRoom(connection, Number(request.bookingId), Number(request.bookingRoomId));
      const target = await lockRoom(connection, Number(request.roomId));
      await validateTargetRoom(connection, booking, bookingRoom, target, assignmentId);
      await connection.execute(
        "UPDATE RoomAssignment SET effective_to = CURRENT_TIMESTAMP WHERE assignment_id = ?",
        [current.id]
      );
      await connection.execute(`
        UPDATE RoomAssignment SET approved_by = ?, effective_from = CURRENT_TIMESTAMP,
          effective_to = ?, reason = ? WHERE assignment_id = ?
      `, [principal.id, request.checkOut, request.reason, assignmentId]);
      await updateRoomStatuses(connection, [current.roomId], "NEEDS_CLEANING", principal.id, "Emergency room move");
      await updateRoomStatuses(connection, [Number(request.roomId)], "OCCUPIED", principal.id, "Emergency room move approved");
      await queueCleaning(connection, current.roomId, Number(request.bookingRoomId), principal.id, "Emergency room move");
      const response = {
        assignmentId, bookingId: Number(request.bookingId), status: "APPROVED",
        fromRoomId: current.roomId, roomId: Number(request.roomId), roomCode: target.roomCode
      };
      await writeAudit(connection, {
        entityType: "RoomAssignment", entityId: assignmentId,
        action: "EMERGENCY_MOVE_APPROVED", actor: employeeActor(principal),
        before: current, after: response, reason: input.reason
      });
      return response;
    });
  }

  async checkOut(bookingId, principal) {
    return this.#transaction(async (connection) => {
      const booking = await lockBooking(connection, bookingId);
      if (booking.status !== "CHECKED_IN") stateError("Only a checked-in booking can check out");
      const [[payment]] = await connection.execute(`
        SELECT COALESCE(SUM(CASE
          WHEN direction = 'IN' AND status IN ('VERIFIED', 'APPROVED', 'COMPLETED') THEN amount
          WHEN direction = 'OUT' AND status IN ('VERIFIED', 'APPROVED', 'COMPLETED') THEN -amount
          ELSE 0 END), 0) AS paid
        FROM Payment WHERE booking_id = ? FOR UPDATE
      `, [bookingId]);
      const totalCents = decimalToCents(booking.total);
      const paidCents = decimalToCents(String(payment.paid));
      const outstandingCents = Math.max(0, totalCents - paidCents);
      if (outstandingCents > 0) {
        throw new ApiError(409, "BOOKING_BALANCE_DUE", "Booking balance must be paid before Check-out", {
          outstanding: centsToDecimal(outstandingCents)
        });
      }
      const assignments = await lockActiveAssignments(connection, bookingId);
      if (assignments.length !== booking.roomCount) {
        throw new ApiError(409, "ROOM_ASSIGNMENT_INCOMPLETE", "Active occupied rooms were not found");
      }
      for (const assignment of assignments) {
        await connection.execute(
          "UPDATE RoomAssignment SET effective_to = CURRENT_TIMESTAMP WHERE assignment_id = ?",
          [assignment.id]
        );
        await queueCleaning(connection, assignment.roomId, assignment.bookingRoomId, principal.id, "Guest checked out");
      }
      await updateRoomStatuses(
        connection, assignments.map(({ roomId }) => roomId),
        "NEEDS_CLEANING", principal.id, "Guest checked out"
      );
      await connection.execute(`
        UPDATE Booking SET status = 'CHECKED_OUT', status_changed_at = CURRENT_TIMESTAMP,
          status_changed_by = ?, actual_check_out_at = CURRENT_TIMESTAMP,
          checked_out_by = ? WHERE booking_id = ?
      `, [principal.id, principal.id, bookingId]);
      const response = {
        bookingId, bookingCode: booking.bookingCode, status: "CHECKED_OUT",
        outstanding: "0.00", roomIds: assignments.map(({ roomId }) => roomId)
      };
      await writeAudit(connection, {
        entityType: "Booking", entityId: bookingId, action: "CHECKED_OUT",
        actor: employeeActor(principal), before: bookingState(booking), after: response
      });
      return response;
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
      throw error;
    } finally {
      connection.release();
    }
  }
}

async function lockBooking(connection, bookingId) {
  const [rows] = await connection.execute(`
    SELECT b.booking_id AS id, b.booking_code AS bookingCode, b.status, b.channel,
           DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS checkIn,
           DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS checkOut,
           b.expected_arrival_at AS expectedArrivalAt,
           CAST(b.total_snapshot AS CHAR) AS total,
           (SELECT COUNT(*) FROM BookingRoom br WHERE br.booking_id = b.booking_id) AS roomCount
    FROM Booking b WHERE b.booking_id = ? FOR UPDATE
  `, [bookingId]);
  if (!rows[0]) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  return { ...rows[0], id: Number(rows[0].id), roomCount: Number(rows[0].roomCount) };
}

async function lockBookingRoom(connection, bookingId, bookingRoomId) {
  const [rows] = await connection.execute(`
    SELECT booking_room_id AS id, room_type_id AS roomTypeId, guest_count AS guestCount
    FROM BookingRoom WHERE booking_room_id = ? AND booking_id = ? FOR UPDATE
  `, [bookingRoomId, bookingId]);
  if (!rows[0]) throw new ApiError(404, "BOOKING_ROOM_NOT_FOUND", "Booked room was not found");
  return { id: Number(rows[0].id), roomTypeId: Number(rows[0].roomTypeId), guestCount: Number(rows[0].guestCount) };
}

async function lockRoom(connection, roomId) {
  const [rows] = await connection.execute(`
    SELECT r.room_id AS id, r.room_type_id AS roomTypeId, r.room_code AS roomCode,
           r.current_status AS status, rt.capacity
    FROM Room r JOIN RoomType rt ON rt.room_type_id = r.room_type_id
    WHERE r.room_id = ? FOR UPDATE
  `, [roomId]);
  if (!rows[0]) throw new ApiError(404, "ROOM_NOT_FOUND", "Room was not found");
  return {
    id: Number(rows[0].id), roomTypeId: Number(rows[0].roomTypeId),
    roomCode: rows[0].roomCode, status: rows[0].status, capacity: Number(rows[0].capacity)
  };
}

async function validateTargetRoom(connection, booking, bookingRoom, room, ignoredAssignmentId = 0) {
  if (room.roomTypeId !== bookingRoom.roomTypeId || bookingRoom.guestCount > room.capacity) {
    throw new ApiError(400, "ROOM_ASSIGNMENT_INVALID", "Room type or capacity does not match the booking");
  }
  if (room.status !== "AVAILABLE") {
    throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "Target room is not available");
  }
  const [[overlap]] = await connection.execute(`
    SELECT COUNT(*) AS count
    FROM RoomAssignment ra
    JOIN BookingRoom br ON br.booking_room_id = ra.booking_room_id
    JOIN Booking b ON b.booking_id = br.booking_id
    WHERE ra.room_id = ? AND ra.assignment_id <> ?
      AND ra.booking_room_id <> ?
      AND ra.effective_from < ? AND ra.effective_to > ?
      AND b.status IN ('CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN')
  `, [room.id, ignoredAssignmentId, bookingRoom.id, booking.checkOut, booking.checkIn]);
  if (Number(overlap.count) > 0) {
    throw new ApiError(409, "ROOM_ASSIGNMENT_CONFLICT", "Room is assigned to an overlapping stay");
  }
}

async function activeAssignment(connection, bookingRoomId) {
  const [rows] = await connection.execute(`
    SELECT ra.assignment_id AS id, ra.booking_room_id AS bookingRoomId,
           ra.room_id AS roomId, r.room_code AS roomCode,
           ra.effective_from AS effectiveFrom, ra.effective_to AS effectiveTo
    FROM RoomAssignment ra JOIN Room r ON r.room_id = ra.room_id
    WHERE ra.booking_room_id = ? AND ra.effective_to > ra.effective_from
    ORDER BY ra.assignment_id DESC LIMIT 1 FOR UPDATE
  `, [bookingRoomId]);
  if (!rows[0]) return null;
  return {
    ...rows[0], id: Number(rows[0].id), bookingRoomId: Number(rows[0].bookingRoomId),
    roomId: Number(rows[0].roomId)
  };
}

async function lockActiveAssignments(connection, bookingId) {
  const [rows] = await connection.execute(`
    SELECT ra.assignment_id AS id, ra.booking_room_id AS bookingRoomId,
           ra.room_id AS roomId, r.current_status AS roomStatus
    FROM BookingRoom br
    JOIN RoomAssignment ra ON ra.assignment_id = (
      SELECT MAX(candidate.assignment_id) FROM RoomAssignment candidate
      WHERE candidate.booking_room_id = br.booking_room_id
        AND candidate.effective_to > candidate.effective_from
    )
    JOIN Room r ON r.room_id = ra.room_id
    WHERE br.booking_id = ? ORDER BY br.booking_room_id FOR UPDATE
  `, [bookingId]);
  return rows.map((row) => ({
    id: Number(row.id), bookingRoomId: Number(row.bookingRoomId),
    roomId: Number(row.roomId), roomStatus: row.roomStatus
  }));
}

async function updateRoomStatuses(connection, roomIds, status, employeeId, reason) {
  for (const roomId of roomIds) {
    await connection.execute(`
      UPDATE Room SET current_status = ?, status_changed_at = CURRENT_TIMESTAMP,
        status_changed_by = ?, status_reason = ?, status_version = status_version + 1
      WHERE room_id = ?
    `, [status, employeeId, reason, roomId]);
  }
}

async function queueCleaning(connection, roomId, bookingRoomId, employeeId, reason) {
  await connection.execute(`
    INSERT INTO RoomEvent
      (room_id, booking_room_id, event_type, status, employee_id, reason)
    VALUES (?, ?, 'CLEANING_QUEUED', 'QUEUED', ?, ?)
  `, [roomId, bookingRoomId, employeeId, reason]);
}

function ensureAssignmentRole(booking, principal) {
  if (booking.channel === "ONLINE" && principal.role !== "superadmin") {
    throw new ApiError(403, "ROLE_FORBIDDEN", "Only Superadmin can assign an online booking");
  }
}

function stateError(message) {
  throw new ApiError(409, "BOOKING_TRANSITION_INVALID", message);
}

function employeeActor(principal) {
  return { type: "employee", id: principal.id };
}

function bookingState(booking) {
  return { id: booking.id, bookingCode: booking.bookingCode, status: booking.status };
}

function assignmentResponse(assignment, booking, room, replayed) {
  return {
    assignmentId: assignment.id, bookingId: booking.id,
    bookingRoomId: assignment.bookingRoomId, roomId: assignment.roomId,
    roomCode: room.roomCode, effectiveFrom: assignment.effectiveFrom,
    effectiveTo: assignment.effectiveTo, replayed
  };
}

function bangkokDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(value);
}
