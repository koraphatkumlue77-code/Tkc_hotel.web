import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";
import { isRoomTransitionAllowed } from "./policy.js";

export class RoomsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listRoomTypes() {
    const [rows] = await this.pool.query(`
      SELECT rt.room_type_id AS id, rt.type_name AS name, rt.capacity,
             CAST(rt.price_per_night AS CHAR) AS pricePerNight,
             CAST(rt.breakfast_daily_rate AS CHAR) AS breakfastDailyRate,
             COUNT(r.room_id) AS totalRooms
      FROM RoomType rt
      LEFT JOIN Room r ON r.room_type_id = rt.room_type_id
      GROUP BY rt.room_type_id, rt.type_name, rt.capacity,
               rt.price_per_night, rt.breakfast_daily_rate
      ORDER BY rt.room_type_id
    `);
    return rows;
  }

  async findAvailability({ checkIn, checkOut, guests }) {
    const [rows] = await this.pool.execute(`
      SELECT rt.room_type_id AS id, rt.type_name AS name, rt.capacity,
             CAST(rt.price_per_night AS CHAR) AS pricePerNight,
             CAST(rt.breakfast_daily_rate AS CHAR) AS breakfastDailyRate,
             COUNT(r.room_id) AS totalRooms,
             COALESCE(reserved.reserved_rooms, 0) AS reservedRooms,
             COALESCE(closed.closed_rooms, 0) AS closedRooms,
             COALESCE(cleaning.cleaning_rooms, 0) AS cleaningRooms,
             COALESCE(blocked.blocked_rooms, 0) AS blockedRooms
      FROM RoomType rt
      JOIN Room r ON r.room_type_id = rt.room_type_id
      LEFT JOIN (
        SELECT br.room_type_id, COUNT(*) AS reserved_rooms
        FROM BookingRoom br
        JOIN Booking b ON b.booking_id = br.booking_id
        WHERE b.check_in_date < ? AND b.check_out_date > ?
          AND (
            (b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
            OR b.status IN ('PAYMENT_REVIEW', 'CONFIRMED', 'CHECKED_IN', 'LATE_ARRIVAL')
          )
        GROUP BY br.room_type_id
      ) reserved ON reserved.room_type_id = rt.room_type_id
      LEFT JOIN (
        SELECT room.room_type_id, COUNT(DISTINCT close_event.room_id) AS closed_rooms
        FROM RoomEvent close_event
        JOIN Room room ON room.room_id = close_event.room_id
        WHERE close_event.event_type = 'ROOM_CLOSED'
          AND COALESCE(close_event.effective_from, close_event.created_at) < ?
          AND COALESCE(close_event.effective_to, '9999-12-31 23:59:59') > ?
          AND NOT EXISTS (
            SELECT 1
            FROM RoomEvent reopen
            WHERE reopen.related_event_id = close_event.room_event_id
              AND reopen.event_type = 'ROOM_REOPENED'
              AND COALESCE(reopen.effective_from, reopen.created_at) <= ?
          )
        GROUP BY room.room_type_id
      ) closed ON closed.room_type_id = rt.room_type_id
      LEFT JOIN (
        SELECT room.room_type_id, COUNT(DISTINCT queued.room_id) AS cleaning_rooms
        FROM RoomEvent queued
        JOIN Room room ON room.room_id = queued.room_id
        WHERE queued.event_type = 'CLEANING_QUEUED'
          AND NOT EXISTS (
            SELECT 1 FROM RoomEvent done
            WHERE done.related_event_id = queued.room_event_id
              AND done.event_type = 'CLEANING_COMPLETED'
          )
        GROUP BY room.room_type_id
      ) cleaning ON cleaning.room_type_id = rt.room_type_id
      LEFT JOIN (
        SELECT blocked_items.room_type_id, COUNT(DISTINCT blocked_items.room_id) AS blocked_rooms
        FROM (
          SELECT room.room_type_id, close_event.room_id
          FROM RoomEvent close_event
          JOIN Room room ON room.room_id = close_event.room_id
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
          SELECT room.room_type_id, queued.room_id
          FROM RoomEvent queued
          JOIN Room room ON room.room_id = queued.room_id
          WHERE queued.event_type = 'CLEANING_QUEUED'
            AND NOT EXISTS (
              SELECT 1 FROM RoomEvent done
              WHERE done.related_event_id = queued.room_event_id
                AND done.event_type = 'CLEANING_COMPLETED'
            )
        ) blocked_items
        GROUP BY blocked_items.room_type_id
      ) blocked ON blocked.room_type_id = rt.room_type_id
      WHERE (? IS NULL OR rt.capacity >= ?)
      GROUP BY rt.room_type_id, rt.type_name, rt.capacity, rt.price_per_night,
               rt.breakfast_daily_rate, reserved.reserved_rooms, closed.closed_rooms,
               cleaning.cleaning_rooms, blocked.blocked_rooms
      ORDER BY rt.room_type_id
    `, [checkOut, checkIn, checkOut, checkIn, checkIn,
      checkOut, checkIn, checkIn, guests, guests]);
    return rows;
  }

  async listStaffRooms({ status, roomTypeId, limit, offset }) {
    const conditions = [];
    const values = [];
    if (status) {
      conditions.push("r.current_status = ?");
      values.push(status);
    }
    if (roomTypeId !== null) {
      conditions.push("r.room_type_id = ?");
      values.push(roomTypeId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(limit, offset);
    const [rows] = await this.pool.execute(`
      SELECT r.room_id AS id, r.room_code AS code, r.current_status AS status,
             r.status_version AS statusVersion, r.area, r.updated_at AS updatedAt,
             rt.room_type_id AS roomTypeId, rt.type_name AS roomTypeName,
             rt.capacity
      FROM Room r JOIN RoomType rt ON rt.room_type_id = r.room_type_id
      ${where}
      ORDER BY r.room_code LIMIT ? OFFSET ?
    `, values);
    return rows;
  }

  async summarizeStaffRooms({ roomTypeId, today }) {
    const roomTypeClause = roomTypeId === null ? "" : "WHERE room_type_id = ?";
    const roomTypeValues = roomTypeId === null ? [] : [roomTypeId];
    const [[roomCounts]] = await this.pool.execute(`
      SELECT
        COALESCE(SUM(current_status = 'AVAILABLE'), 0) AS available,
        COALESCE(SUM(current_status = 'OCCUPIED'), 0) AS occupied,
        COALESCE(SUM(current_status = 'NEEDS_CLEANING'), 0) AS cleaning,
        COALESCE(SUM(current_status = 'OUT_OF_SERVICE'), 0) AS outOfService
      FROM Room ${roomTypeClause}
    `, roomTypeValues);
    const bookingTypeClause = roomTypeId === null ? "" : "AND br.room_type_id = ?";
    const [[bookingCounts]] = await this.pool.execute(`
      SELECT COUNT(*) AS booked
      FROM BookingRoom br
      JOIN Booking b ON b.booking_id = br.booking_id
      WHERE b.check_in_date <= ? AND b.check_out_date > ?
        AND b.status IN ('CONFIRMED', 'LATE_ARRIVAL')
        ${bookingTypeClause}
    `, [today, today, ...roomTypeValues]);
    const booked = Number(bookingCounts.booked);
    return {
      available: Math.max(0, Number(roomCounts.available) - booked),
      booked,
      occupied: Number(roomCounts.occupied),
      cleaning: Number(roomCounts.cleaning),
      outOfService: Number(roomCounts.outOfService)
    };
  }

  async findStaffRoomById(roomId) {
    const [rows] = await this.pool.execute(`
      SELECT room_id AS id, room_code AS code, current_status AS status,
             status_version AS statusVersion, area
      FROM Room WHERE room_id = ?
    `, [roomId]);
    return rows[0] ?? null;
  }

  async updateRoomStatus({ roomId, status, expectedVersion, reason, actorId, actorRole }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [beforeRows] = await connection.execute(`
        SELECT room_id AS id, room_code AS code, current_status AS status,
               status_version AS statusVersion, area
        FROM Room WHERE room_id = ? FOR UPDATE
      `, [roomId]);
      const before = beforeRows[0];
      if (!before) throw new ApiError(404, "ROOM_NOT_FOUND", "Room was not found");
      if (Number(before.statusVersion) !== expectedVersion) {
        throw new ApiError(409, "ROOM_VERSION_CONFLICT", "Room was changed by another request");
      }
      if (!isRoomTransitionAllowed(actorRole, before.status, status)) {
        throw new ApiError(403, "ROOM_TRANSITION_FORBIDDEN", "Your role cannot perform this room transition");
      }
      await connection.execute(`
        UPDATE Room
        SET current_status = ?, status_reason = ?, status_changed_by = ?,
            status_changed_at = CURRENT_TIMESTAMP, status_version = status_version + 1
        WHERE room_id = ?
      `, [status, reason, actorId, roomId]);
      const [afterRows] = await connection.execute(`
        SELECT room_id AS id, room_code AS code, current_status AS status,
               status_version AS statusVersion, area, updated_at AS updatedAt
        FROM Room WHERE room_id = ?
      `, [roomId]);
      const after = afterRows[0];
      await writeAudit(connection, {
        entityType: "Room",
        entityId: roomId,
        action: "STATUS_CHANGED",
        actor: { type: "employee", id: actorId },
        before,
        after,
        reason
      });
      await connection.commit();
      return after;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createRoomType(data, actorId) {
    return this.#catalogTransaction(async (connection) => {
      const [result] = await connection.execute(`
        INSERT INTO RoomType (type_name, capacity, price_per_night, breakfast_daily_rate)
        VALUES (?, ?, ?, ?)
      `, [data.name, data.capacity, data.pricePerNight, data.breakfastDailyRate]);
      const record = await this.#roomTypeById(connection, result.insertId);
      await this.#auditCatalog(connection, "RoomType", result.insertId, "CATALOG_CREATED", actorId, null, record);
      return record;
    });
  }

  async updateRoomType(roomTypeId, data, actorId) {
    return this.#catalogTransaction(async (connection) => {
      const before = await this.#roomTypeById(connection, roomTypeId, true);
      if (!before) throw new ApiError(404, "ROOM_TYPE_NOT_FOUND", "Room type was not found");
      await connection.execute(`
        UPDATE RoomType SET type_name = ?, capacity = ?, price_per_night = ?, breakfast_daily_rate = ?
        WHERE room_type_id = ?
      `, [data.name, data.capacity, data.pricePerNight, data.breakfastDailyRate, roomTypeId]);
      const after = await this.#roomTypeById(connection, roomTypeId);
      await this.#auditCatalog(connection, "RoomType", roomTypeId, "CATALOG_UPDATED", actorId, before, after);
      return after;
    });
  }

  async createRoom(data, actorId) {
    return this.#catalogTransaction(async (connection) => {
      const [result] = await connection.execute(`
        INSERT INTO Room (room_type_id, room_code, current_status, area)
        VALUES (?, ?, 'AVAILABLE', ?)
      `, [data.roomTypeId, data.code, data.area]);
      const record = await this.#roomById(connection, result.insertId);
      await this.#auditCatalog(connection, "Room", result.insertId, "CATALOG_CREATED", actorId, null, record);
      return record;
    });
  }

  async updateRoomCatalog(roomId, data, actorId) {
    return this.#catalogTransaction(async (connection) => {
      const before = await this.#roomById(connection, roomId, true);
      if (!before) throw new ApiError(404, "ROOM_NOT_FOUND", "Room was not found");
      if (Number(before.statusVersion) !== data.expectedVersion) {
        throw new ApiError(409, "ROOM_VERSION_CONFLICT", "Room was changed by another request");
      }
      if (Number(before.roomTypeId) !== data.roomTypeId) {
        const [assignments] = await connection.execute(`
          SELECT ra.assignment_id
          FROM RoomAssignment ra
          JOIN BookingRoom br ON br.booking_room_id = ra.booking_room_id
          JOIN Booking b ON b.booking_id = br.booking_id
          WHERE ra.room_id = ?
            AND br.room_type_id <> ?
            AND (
              (b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP)
              OR b.status IN ('PAYMENT_REVIEW','CONFIRMED','CHECKED_IN','LATE_ARRIVAL')
            )
            AND b.check_out_date >= CURRENT_DATE
          LIMIT 1
          FOR UPDATE
        `, [roomId, data.roomTypeId]);
        if (assignments.length > 0) {
          throw new ApiError(409, "ROOM_TYPE_ASSIGNMENT_CONFLICT", "Room type conflicts with an active assignment");
        }
      }
      await connection.execute(`
        UPDATE Room SET room_type_id = ?, room_code = ?, area = ?, status_version = status_version + 1
        WHERE room_id = ?
      `, [data.roomTypeId, data.code, data.area, roomId]);
      const after = await this.#roomById(connection, roomId);
      await this.#auditCatalog(connection, "Room", roomId, "CATALOG_UPDATED", actorId, before, after);
      return after;
    });
  }

  async #catalogTransaction(work) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        throw new ApiError(409, "CATALOG_CONFLICT", "Catalog value already exists");
      }
      if (error?.code === "ER_NO_REFERENCED_ROW_2") {
        throw new ApiError(400, "VALIDATION_ERROR", "Referenced room type does not exist");
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async #roomTypeById(executor, id, lock = false) {
    const [rows] = await executor.execute(`
      SELECT room_type_id AS id, type_name AS name, capacity,
             CAST(price_per_night AS CHAR) AS pricePerNight,
             CAST(breakfast_daily_rate AS CHAR) AS breakfastDailyRate
      FROM RoomType WHERE room_type_id = ? ${lock ? "FOR UPDATE" : ""}
    `, [id]);
    return rows[0] ?? null;
  }

  async #roomById(executor, id, lock = false) {
    const [rows] = await executor.execute(`
      SELECT room_id AS id, room_type_id AS roomTypeId, room_code AS code,
             current_status AS status, status_version AS statusVersion, area
      FROM Room WHERE room_id = ? ${lock ? "FOR UPDATE" : ""}
    `, [id]);
    return rows[0] ?? null;
  }

  async #auditCatalog(connection, entityType, entityId, action, actorId, before, after) {
    await writeAudit(connection, {
      entityType,
      entityId,
      action,
      actor: { type: "employee", id: actorId },
      before,
      after
    });
  }
}
