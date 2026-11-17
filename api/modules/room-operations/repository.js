// SQL สำหรับงานแม่บ้าน ความเสียหาย และปิดห้อง โดยเก็บเหตุการณ์ต่อเนื่องใน RoomEvent
import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";

export class RoomOperationsRepository {
  constructor(pool) { this.pool = pool; }

  async listCleaning() {
    const [rows] = await this.pool.execute(`SELECT queued.room_event_id AS id, queued.room_id AS roomId,
      r.room_code AS roomCode, rt.type_name AS roomTypeName, queued.status, queued.created_at AS queuedAt,
      started.started_at AS startedAt
      FROM RoomEvent queued JOIN Room r ON r.room_id = queued.room_id JOIN RoomType rt ON rt.room_type_id = r.room_type_id
      LEFT JOIN RoomEvent started ON started.related_event_id = queued.room_event_id AND started.event_type = 'CLEANING_STARTED'
      WHERE queued.event_type = 'CLEANING_QUEUED' AND NOT EXISTS
        (SELECT 1 FROM RoomEvent done WHERE done.related_event_id = queued.room_event_id AND done.event_type = 'CLEANING_COMPLETED')
      ORDER BY queued.created_at, queued.room_event_id`);
    return rows.map(eventRecord);
  }

  async cleaning(eventId, action, employeeId) {
    return this.#transaction(async (connection) => {
      const queued = await lockEvent(connection, eventId, "CLEANING_QUEUED"); const room = await lockRoom(connection, queued.roomId);
      const [related] = await connection.execute("SELECT room_event_id AS id, event_type AS eventType FROM RoomEvent WHERE related_event_id = ? FOR UPDATE", [eventId]);
      const started = related.find(({ eventType }) => eventType === "CLEANING_STARTED"); const completed = related.find(({ eventType }) => eventType === "CLEANING_COMPLETED");
      if (action === "START") {
        if (completed) throw new ApiError(409, "CLEANING_ALREADY_COMPLETED", "Cleaning was already completed");
        if (started) return { id: Number(started.id), queueId: eventId, roomId: queued.roomId, status: "STARTED" };
        const [result] = await connection.execute("INSERT INTO RoomEvent (room_id, booking_room_id, event_type, status, employee_id, related_event_id, started_at) VALUES (?, ?, 'CLEANING_STARTED', 'STARTED', ?, ?, CURRENT_TIMESTAMP)", [queued.roomId, queued.bookingRoomId, employeeId, eventId]);
        await connection.execute("UPDATE RoomEvent SET status = 'STARTED', started_at = CURRENT_TIMESTAMP WHERE room_event_id = ?", [eventId]);
        const response = { id: Number(result.insertId), queueId: eventId, roomId: queued.roomId, status: "STARTED" };
        await audit(connection, "RoomEvent", response.id, "CLEANING_STARTED", employeeId, null, response); return response;
      }
      if (!started) throw new ApiError(409, "CLEANING_NOT_STARTED", "Cleaning must be started first");
      if (completed) return { id: Number(completed.id), queueId: eventId, roomId: queued.roomId, status: "COMPLETED", roomStatus: room.status };
      const [[closure]] = await connection.execute(`${ACTIVE_CLOSURE_COUNT}`, [queued.roomId]);
      const roomStatus = Number(closure.count) > 0 ? "OUT_OF_SERVICE" : "AVAILABLE";
      const [result] = await connection.execute("INSERT INTO RoomEvent (room_id, booking_room_id, event_type, status, employee_id, related_event_id, started_at, completed_at) VALUES (?, ?, 'CLEANING_COMPLETED', 'COMPLETED', ?, ?, (SELECT started_at FROM RoomEvent s WHERE s.room_event_id = ?), CURRENT_TIMESTAMP)", [queued.roomId, queued.bookingRoomId, employeeId, eventId, started.id]);
      await connection.execute("UPDATE RoomEvent SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE room_event_id IN (?, ?)", [eventId, started.id]);
      await updateRoom(connection, queued.roomId, roomStatus, employeeId, "Cleaning completed");
      const response = { id: Number(result.insertId), queueId: eventId, roomId: queued.roomId, status: "COMPLETED", roomStatus };
      await audit(connection, "RoomEvent", response.id, "CLEANING_COMPLETED", employeeId, null, response); return response;
    });
  }

  async reportDamage(roomId, input, photoReference, employeeId) {
    return this.#transaction(async (connection) => {
      const room = await lockRoom(connection, roomId); ensureVersion(room, input.expectedVersion);
      const [result] = await connection.execute("INSERT INTO RoomEvent (room_id, event_type, status, employee_id, item, description, photo_reference) VALUES (?, 'DAMAGE_REPORTED', 'REPORTED', ?, ?, ?, ?)", [roomId, employeeId, input.item, input.description, photoReference]);
      await connection.execute("UPDATE Room SET status_version = status_version + 1, status_changed_at = CURRENT_TIMESTAMP, status_changed_by = ?, status_reason = ? WHERE room_id = ?", [employeeId, `Damage reported: ${input.item}`, roomId]);
      const response = { id: Number(result.insertId), roomId, item: input.item, description: input.description, photoReference, status: "REPORTED" };
      await audit(connection, "RoomEvent", response.id, "DAMAGE_REPORTED", employeeId, null, response); return response;
    });
  }

  async photo(eventId) { const [rows] = await this.pool.execute("SELECT photo_reference AS photo FROM RoomEvent WHERE room_event_id = ? AND event_type = 'DAMAGE_REPORTED'", [eventId]); return rows[0]?.photo ?? null; }
  async listDamages() { const [rows] = await this.pool.execute(`SELECT report.room_event_id AS id, report.room_id AS roomId, r.room_code AS roomCode,
    report.item, report.description, report.photo_reference AS photoReference, report.status, report.created_at AS reportedAt,
    EXISTS(SELECT 1 FROM RoomEvent e WHERE e.related_event_id = report.room_event_id AND e.event_type = 'DAMAGE_REVIEWED') AS reviewed,
    EXISTS(SELECT 1 FROM RoomEvent e WHERE e.related_event_id = report.room_event_id AND e.event_type = 'DAMAGE_RESOLVED') AS resolved
    FROM RoomEvent report JOIN Room r ON r.room_id = report.room_id WHERE report.event_type = 'DAMAGE_REPORTED' ORDER BY report.created_at DESC`); return rows.map((row) => ({ ...eventRecord(row), reviewed: Boolean(row.reviewed), resolved: Boolean(row.resolved) })); }

  async damageDecision(eventId, eventType, input, employeeId) {
    return this.#transaction(async (connection) => {
      const report = await lockEvent(connection, eventId, "DAMAGE_REPORTED");
      const required = eventType === "DAMAGE_RESOLVED" ? "DAMAGE_REVIEWED" : null;
      const [existing] = await connection.execute("SELECT room_event_id AS id, event_type AS eventType FROM RoomEvent WHERE related_event_id = ? FOR UPDATE", [eventId]);
      if (existing.some(({ eventType: type }) => type === eventType)) throw new ApiError(409, "DAMAGE_ALREADY_DECIDED", "Damage action was already recorded");
      if (required && !existing.some(({ eventType: type }) => type === required)) throw new ApiError(409, "DAMAGE_NOT_REVIEWED", "Damage must be reviewed first");
      const status = eventType === "DAMAGE_REVIEWED" ? "REVIEWED" : "RESOLVED";
      const [result] = await connection.execute("INSERT INTO RoomEvent (room_id, event_type, status, employee_id, related_event_id, reason) VALUES (?, ?, ?, ?, ?, ?)", [report.roomId, eventType, status, employeeId, eventId, input.reason]);
      await connection.execute("UPDATE RoomEvent SET status = ? WHERE room_event_id = ?", [status, eventId]);
      const response = { id: Number(result.insertId), reportId: eventId, roomId: report.roomId, status, reason: input.reason };
      await audit(connection, "RoomEvent", response.id, eventType, employeeId, null, response); return response;
    });
  }

  async closeRoom(roomId, input, employeeId) {
    return this.#transaction(async (connection) => {
      const room = await lockRoom(connection, roomId); ensureVersion(room, input.expectedVersion);
      if (room.status === "OCCUPIED") throw new ApiError(409, "OCCUPIED_ROOM_CANNOT_CLOSE", "Occupied room cannot be closed");
      const [result] = await connection.execute("INSERT INTO RoomEvent (room_id, event_type, status, employee_id, reason, effective_from, effective_to) VALUES (?, 'ROOM_CLOSED', 'ACTIVE', ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)", [roomId, employeeId, input.reason, input.effectiveFrom, input.effectiveTo]);
      const effectiveNow = !input.effectiveFrom || (new Date(input.effectiveFrom).valueOf() <= Date.now() && (!input.effectiveTo || new Date(input.effectiveTo).valueOf() > Date.now()));
      await connection.execute("UPDATE Room SET current_status = ?, status_version = status_version + 1, status_changed_at = CURRENT_TIMESTAMP, status_changed_by = ?, status_reason = ? WHERE room_id = ?", [effectiveNow ? "OUT_OF_SERVICE" : room.status, employeeId, input.reason, roomId]);
      const response = { id: Number(result.insertId), roomId, status: "ACTIVE", roomStatus: effectiveNow ? "OUT_OF_SERVICE" : room.status, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, reason: input.reason };
      await audit(connection, "RoomEvent", response.id, "ROOM_CLOSED", employeeId, null, response); return response;
    });
  }

  async reopen(eventId, input, employeeId) {
    return this.#transaction(async (connection) => {
      const closure = await lockEvent(connection, eventId, "ROOM_CLOSED"); const room = await lockRoom(connection, closure.roomId); ensureVersion(room, input.expectedVersion);
      const [existing] = await connection.execute("SELECT room_event_id AS id FROM RoomEvent WHERE related_event_id = ? AND event_type = 'ROOM_REOPENED' FOR UPDATE", [eventId]);
      if (existing[0]) throw new ApiError(409, "ROOM_CLOSURE_REOPENED", "Room closure was already reopened");
      const [[otherClosures]] = await connection.execute(`${ACTIVE_CLOSURE_COUNT} AND close_event.room_event_id <> ?`, [closure.roomId, eventId]);
      const [[openCleaning]] = await connection.execute(`SELECT COUNT(*) AS count FROM RoomEvent queued WHERE queued.room_id = ? AND queued.event_type = 'CLEANING_QUEUED' AND NOT EXISTS (SELECT 1 FROM RoomEvent done WHERE done.related_event_id = queued.room_event_id AND done.event_type = 'CLEANING_COMPLETED')`, [closure.roomId]);
      const roomStatus = Number(otherClosures.count) > 0 ? "OUT_OF_SERVICE" : Number(openCleaning.count) > 0 ? "NEEDS_CLEANING" : "AVAILABLE";
      const [result] = await connection.execute("INSERT INTO RoomEvent (room_id, event_type, status, employee_id, related_event_id, reason, effective_from) VALUES (?, 'ROOM_REOPENED', 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP)", [closure.roomId, employeeId, eventId, input.reason]);
      await connection.execute("UPDATE RoomEvent SET status = 'REOPENED' WHERE room_event_id = ?", [eventId]);
      await updateRoom(connection, closure.roomId, roomStatus, employeeId, input.reason);
      const response = { id: Number(result.insertId), closureId: eventId, roomId: closure.roomId, roomStatus, reason: input.reason };
      await audit(connection, "RoomEvent", response.id, "ROOM_REOPENED", employeeId, null, response); return response;
    });
  }

  async history(roomId, { page, limit }) {
    const [[room]] = await this.pool.execute("SELECT room_id AS id FROM Room WHERE room_id = ?", [roomId]); if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "Room was not found");
    const [[count]] = await this.pool.execute("SELECT COUNT(*) AS total FROM RoomEvent WHERE room_id = ?", [roomId]);
    const [rows] = await this.pool.execute(`SELECT room_event_id AS id, event_type AS eventType, status, employee_id AS employeeId,
      related_event_id AS relatedEventId, item, description, photo_reference AS photoReference, reason,
      started_at AS startedAt, completed_at AS completedAt, effective_from AS effectiveFrom,
      effective_to AS effectiveTo, created_at AS createdAt FROM RoomEvent WHERE room_id = ?
      ORDER BY created_at DESC, room_event_id DESC LIMIT ? OFFSET ?`, [roomId, limit, (page - 1) * limit]);
    return { data: rows.map(eventRecord), meta: { page, limit, total: Number(count.total) } };
  }

  async #transaction(work) { const connection = await this.pool.getConnection(); try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; } catch (error) { await connection.rollback(); if (["ER_LOCK_DEADLOCK","ER_LOCK_WAIT_TIMEOUT"].includes(error?.code)) throw new ApiError(409, "ROOM_OPERATION_CONFLICT", "Room was changed by another request"); throw error; } finally { connection.release(); } }
}

const ACTIVE_CLOSURE_COUNT = `SELECT COUNT(*) AS count FROM RoomEvent close_event WHERE close_event.room_id = ? AND close_event.event_type = 'ROOM_CLOSED'
  AND COALESCE(close_event.effective_from, close_event.created_at) <= CURRENT_TIMESTAMP
  AND COALESCE(close_event.effective_to, '9999-12-31 23:59:59') > CURRENT_TIMESTAMP
  AND NOT EXISTS (SELECT 1 FROM RoomEvent reopen WHERE reopen.related_event_id = close_event.room_event_id AND reopen.event_type = 'ROOM_REOPENED' AND COALESCE(reopen.effective_from, reopen.created_at) <= CURRENT_TIMESTAMP)`;
async function lockEvent(connection, id, type) { const [rows] = await connection.execute("SELECT room_event_id AS id, room_id AS roomId, booking_room_id AS bookingRoomId, event_type AS eventType, status FROM RoomEvent WHERE room_event_id = ? AND event_type = ? FOR UPDATE", [id,type]); if (!rows[0]) throw new ApiError(404, "ROOM_EVENT_NOT_FOUND", "Room event was not found"); return eventRecord(rows[0]); }
async function lockRoom(connection,id) { const [rows] = await connection.execute("SELECT room_id AS id, room_code AS code, current_status AS status, status_version AS statusVersion FROM Room WHERE room_id = ? FOR UPDATE", [id]); if (!rows[0]) throw new ApiError(404,"ROOM_NOT_FOUND","Room was not found"); return { ...rows[0], id:Number(rows[0].id), statusVersion:Number(rows[0].statusVersion) }; }
function ensureVersion(room, expected) { if (room.statusVersion !== expected) throw new ApiError(409,"ROOM_VERSION_CONFLICT","Room was changed by another request"); }
async function updateRoom(connection,id,status,employeeId,reason) { await connection.execute("UPDATE Room SET current_status = ?, status_version = status_version + 1, status_changed_at = CURRENT_TIMESTAMP, status_changed_by = ?, status_reason = ? WHERE room_id = ?", [status,employeeId,reason,id]); }
async function audit(connection,entityType,entityId,action,employeeId,before,after) { await writeAudit(connection,{ entityType,entityId,action,actor:{type:"employee",id:employeeId},before,after }); }
function eventRecord(row) { return { ...row, id: Number(row.id), roomId: row.roomId == null ? undefined : Number(row.roomId), bookingRoomId: row.bookingRoomId == null ? null : Number(row.bookingRoomId), employeeId: row.employeeId == null ? null : Number(row.employeeId), relatedEventId: row.relatedEventId == null ? null : Number(row.relatedEventId) }; }
