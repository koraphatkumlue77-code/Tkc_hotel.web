// SQL สำหรับ Promotion และ Service ประเภทสถานที่ท่องเที่ยว; ส่วนลดในใบจองถูก snapshot ที่ BookingPromotion
import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";

export class PromotionsRepository {
  constructor(pool) { this.pool = pool; }

  async listPromotions() {
    const [rows] = await this.pool.execute(`${PROMOTION_SELECT} ORDER BY priority, id`);
    return rows.map(promotionRecord);
  }

  async savePromotion(id, input, employeeId) {
    return this.#transaction(async (connection) => {
      let before = null;
      let resultId = id;
      if (id) {
        const [rows] = await connection.execute(`${PROMOTION_SELECT} WHERE promotion_id = ? FOR UPDATE`, [id]);
        if (!rows[0]) throw new ApiError(404, "PROMOTION_NOT_FOUND", "Promotion was not found");
        before = promotionRecord(rows[0]);
        await connection.execute(`
          UPDATE Promotion SET code = ?, name = ?, discount_percent = ?, priority = ?,
            valid_from = ?, valid_until = ?, active = ? WHERE promotion_id = ?
        `, [input.code, input.name, input.discountPercent, input.priority, input.validFrom, input.validUntil, input.active, id]);
      } else {
        const [result] = await connection.execute(`
          INSERT INTO Promotion
            (code, name, discount_percent, priority, valid_from, valid_until, active, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [input.code, input.name, input.discountPercent, input.priority, input.validFrom, input.validUntil, input.active, employeeId]);
        resultId = Number(result.insertId);
      }
      const [afterRows] = await connection.execute(`${PROMOTION_SELECT} WHERE promotion_id = ?`, [resultId]);
      const after = promotionRecord(afterRows[0]);
      await writeAudit(connection, {
        entityType: "Promotion", entityId: resultId,
        action: id ? "PROMOTION_UPDATED" : "PROMOTION_CREATED",
        actor: { type: "employee", id: employeeId }, before, after
      });
      return after;
    }, "PROMOTION_CODE_IN_USE", "Promotion code is already in use");
  }

  async listAttractions() {
    const [rows] = await this.pool.execute(`${ATTRACTION_SELECT}
      WHERE service_kind = 'ATTRACTION' AND visible = TRUE AND active = TRUE ORDER BY id`);
    return rows.map(attractionRecord);
  }

  async listManageableAttractions() {
    const [rows] = await this.pool.execute(`${ATTRACTION_SELECT}
      WHERE service_kind IN ('ATTRACTION', 'TOUR') ORDER BY id`);
    return rows.map(attractionRecord);
  }

  async saveAttraction(id, input, employeeId) {
    return this.#transaction(async (connection) => {
      let before = null;
      let resultId = id;
      if (id) {
        const [rows] = await connection.execute(`${ATTRACTION_SELECT}
          WHERE service_id = ? AND service_kind IN ('ATTRACTION', 'TOUR') FOR UPDATE`, [id]);
        if (!rows[0]) throw new ApiError(404, "ATTRACTION_NOT_FOUND", "Attraction was not found");
        before = attractionRecord(rows[0]);
        if (input.tripType) {
          await connection.execute(`
            UPDATE Service SET name = ?, service_kind = 'TOUR', charge_unit = 'PER_PERSON_PER_ROUND',
              default_rate = 0, included_in_room = FALSE, description = ?, image_reference = ?, season = ?,
              visible = ?, schedule_json = ?, active = ? WHERE service_id = ?
          `, [input.name, input.description, input.imageReference, input.season,
            input.visible, JSON.stringify(input.schedule), input.active, id]);
        } else {
          await connection.execute(`
            UPDATE Service SET name = ?, description = ?, image_reference = ?, season = ?,
              visible = ?, schedule_json = ?, active = ? WHERE service_id = ?
          `, [input.name, input.description, input.imageReference, input.season,
            input.visible, JSON.stringify(input.schedule), input.active, id]);
        }
      } else {
        const [result] = input.tripType
          ? await connection.execute(`
              INSERT INTO Service
                (name, service_kind, description, image_reference, season, visible,
                 schedule_json, charge_unit, default_rate, included_in_room, active)
              VALUES (?, 'TOUR', ?, ?, ?, ?, ?, 'PER_PERSON_PER_ROUND', 0, FALSE, ?)
            `, [input.name, input.description, input.imageReference, input.season,
              input.visible, JSON.stringify(input.schedule), input.active])
          : await connection.execute(`
              INSERT INTO Service
                (name, service_kind, description, image_reference, season, visible,
                 schedule_json, charge_unit, default_rate, included_in_room, active)
              VALUES (?, 'ATTRACTION', ?, ?, ?, ?, ?, 'CONTENT', 0, FALSE, ?)
            `, [input.name, input.description, input.imageReference, input.season,
              input.visible, JSON.stringify(input.schedule), input.active]);
        resultId = Number(result.insertId);
      }
      const [afterRows] = await connection.execute(`${ATTRACTION_SELECT} WHERE service_id = ?`, [resultId]);
      const after = attractionRecord(afterRows[0]);
      await writeAudit(connection, {
        entityType: "Service", entityId: resultId,
        action: id ? "ATTRACTION_UPDATED" : "ATTRACTION_CREATED",
        actor: { type: "employee", id: employeeId }, before, after
      });
      return after;
    }, "ATTRACTION_NAME_IN_USE", "Attraction name is already in use");
  }

  async #transaction(work, duplicateCode, duplicateMessage) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") throw new ApiError(409, duplicateCode, duplicateMessage);
      throw error;
    } finally { connection.release(); }
  }
}

const PROMOTION_SELECT = `
  SELECT promotion_id AS id, code, name, CAST(discount_percent AS CHAR) AS discountPercent,
         priority, valid_from AS validFrom, valid_until AS validUntil, active,
         created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
  FROM Promotion`;

const ATTRACTION_SELECT = `
  SELECT service_id AS id, name, service_kind AS serviceKind, description,
         image_reference AS imageReference, season, visible, schedule_json AS schedule,
         active, created_at AS createdAt, updated_at AS updatedAt
  FROM Service`;

function promotionRecord(row) {
  return { ...row, id: Number(row.id), priority: Number(row.priority), active: Boolean(row.active), createdBy: row.createdBy == null ? null : Number(row.createdBy) };
}

function attractionRecord(row) {
  return { ...row, id: Number(row.id), visible: Boolean(row.visible), active: Boolean(row.active) };
}
