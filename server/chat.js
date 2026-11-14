import { pool, withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export function chatRoutes(app) {
  app.get(
    "/api/chats",
    requireRole("reception", "management"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT a.id AS threadId,c.full_name AS customerName,MAX(m.created_at) AS lastMessageAt,COUNT(m.id) AS messageCount FROM accounts a JOIN customers c ON c.id=a.customer_id LEFT JOIN chat_messages m ON m.account_id=a.id WHERE a.role='member' GROUP BY a.id ORDER BY lastMessageAt DESC LIMIT 100",
      );
      res.json(rows);
    }),
  );
  app.get(
    "/api/chats/:threadId/messages",
    requireRole("member", "reception", "management"),
    asyncRoute(async (req, res) => {
      if (
        req.session.role === "member" &&
        Number(req.params.threadId) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์ดูแชตนี้");
      const [rows] = await pool.execute(
        "SELECT m.id,m.sender_id AS senderId,a.role AS senderRole,m.recipient_id AS recipientId,m.content,m.created_at AS createdAt FROM chat_messages m JOIN accounts a ON a.id=m.sender_id WHERE m.account_id=? ORDER BY m.id DESC LIMIT 100",
        [req.params.threadId],
      );
      res.json(rows.reverse());
    }),
  );
  app.post(
    "/api/chats/:threadId/messages",
    requireRole("member", "reception"),
    asyncRoute(async (req, res) => {
      if (
        req.session.role === "member" &&
        Number(req.params.threadId) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์ส่งข้อความ");
      if (
        typeof req.body.content !== "string" ||
        !req.body.content.trim() ||
        req.body.content.length > 2000
      )
        fail(400, "ข้อความไม่ถูกต้อง");
      const [[thread]] = await pool.execute(
        "SELECT id FROM accounts WHERE id=? AND role='member' AND active=1",
        [req.params.threadId],
      );
      if (!thread) fail(404, "ไม่พบสมาชิก");
      const recipientId =
        req.session.role === "member"
          ? (
              await pool.query(
                "SELECT id FROM accounts WHERE role='reception' AND active=1 ORDER BY id LIMIT 1",
              )
            )[0][0]?.id
          : req.params.threadId;
      const id = await withTransaction(async (c) => {
        const [result] = await c.execute(
          "INSERT INTO chat_messages (account_id,sender_id,recipient_id,content) VALUES (?,?,?,?)",
          [
            req.params.threadId,
            req.session.accountId,
            recipientId,
            req.body.content.trim(),
          ],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "send",
          entity: "chat_message",
          entityId: result.insertId,
          after: { threadId: req.params.threadId },
        });
        return result.insertId;
      });
      res.status(201).json({ id });
    }),
  );
}
