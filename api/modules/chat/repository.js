import { ApiError } from "../../middleware/errors.js";
import { writeAudit } from "../auth/repository.js";

export class ChatRepository {
  constructor(pool) { this.pool = pool; }

  async messages(customerId, { after, limit }, reader) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [customer] = await connection.execute(
        "SELECT customer_id AS id FROM Customer WHERE customer_id = ? AND active = TRUE FOR UPDATE",
        [customerId]
      );
      if (!customer[0]) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
      await connection.execute(
        "UPDATE ChatMessage SET read_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND read_at IS NULL AND sender_type = ?",
        [customerId, reader === "EMPLOYEE" ? "CUSTOMER" : "EMPLOYEE"]
      );
      const [rows] = await connection.execute(
        `${MESSAGE_SELECT} WHERE m.customer_id = ? AND m.message_id > ? ORDER BY m.message_id LIMIT ?`,
        [customerId, after, limit]
      );
      await connection.commit();
      return rows.map(record);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async send(customerId, senderType, employeeId, input, principal) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [customer] = await connection.execute(
        "SELECT customer_id AS id FROM Customer WHERE customer_id = ? AND active = TRUE FOR UPDATE",
        [customerId]
      );
      if (!customer[0]) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
      const [result] = await connection.execute(
        "INSERT INTO ChatMessage (customer_id, sender_type, sender_employee_id, message_text) VALUES (?, ?, ?, ?)",
        [customerId, senderType, employeeId, input.message]
      );
      const response = {
        id: Number(result.insertId), customerId, senderType, message: input.message,
        sentAt: new Date(), readAt: null
      };
      await writeAudit(connection, {
        entityType: "ChatMessage", entityId: response.id, action: "CHAT_MESSAGE_SENT",
        actor: { type: principal.type, id: principal.id },
        after: { id: response.id, customerId, senderType }
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

  async deleteMessage(customerId, messageId, principal) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        "SELECT message_id AS id, sender_type AS senderType FROM ChatMessage WHERE message_id = ? AND customer_id = ? FOR UPDATE",
        [messageId, customerId]
      );
      const message = rows[0];
      if (!message) throw new ApiError(404, "CHAT_MESSAGE_NOT_FOUND", "Chat message was not found");
      await connection.execute(
        "UPDATE ChatMessage SET message_text = '[ข้อความถูกลบโดยเจ้าหน้าที่]' WHERE message_id = ? AND customer_id = ?",
        [messageId, customerId]
      );
      await writeAudit(connection, {
        entityType: "ChatMessage", entityId: messageId, action: "CHAT_MESSAGE_DELETED",
        actor: { type: principal.type, id: principal.id },
        before: { customerId, senderType: message.senderType },
        after: { deleted: true }
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async conversations({ page, limit }) {
    const [[count]] = await this.pool.execute(
      "SELECT COUNT(DISTINCT customer_id) AS total FROM ChatMessage"
    );
    const [rows] = await this.pool.execute(`
      SELECT c.customer_id AS customerId, c.full_name AS customerName, c.email,
             MAX(m.sent_at) AS lastMessageAt,
             SUM(m.sender_type = 'CUSTOMER' AND m.read_at IS NULL) AS unreadCount,
             (SELECT x.message_text FROM ChatMessage x WHERE x.customer_id = c.customer_id
              ORDER BY x.message_id DESC LIMIT 1) AS lastMessage
      FROM ChatMessage m JOIN Customer c ON c.customer_id = m.customer_id
      GROUP BY c.customer_id, c.full_name, c.email
      ORDER BY lastMessageAt DESC LIMIT ? OFFSET ?
    `, [limit, (page - 1) * limit]);
    return {
      data: rows.map(row => ({ ...row, customerId: Number(row.customerId), unreadCount: Number(row.unreadCount) })),
      meta: { page, limit, total: Number(count.total) }
    };
  }
}

const MESSAGE_SELECT = `
  SELECT m.message_id AS id, m.customer_id AS customerId, m.sender_type AS senderType,
         m.sender_employee_id AS senderEmployeeId, m.message_text AS message,
         (m.message_text = '[ข้อความถูกลบโดยเจ้าหน้าที่]') AS deleted,
         m.sent_at AS sentAt, m.read_at AS readAt, e.name AS employeeName
  FROM ChatMessage m LEFT JOIN Employee e ON e.employee_id = m.sender_employee_id
`;

function record(row) {
  return {
    ...row, id: Number(row.id), customerId: Number(row.customerId), deleted: Boolean(row.deleted),
    senderEmployeeId: row.senderEmployeeId == null ? null : Number(row.senderEmployeeId)
  };
}
