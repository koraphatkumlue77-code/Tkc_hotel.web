import { pool, withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { hashPassword } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

const roles = [
  "superadmin",
  "reception",
  "accounting",
  "management",
  "housekeeping",
];
export const canManageRole = (actor, target) =>
  actor === "management" ||
  (actor === "superadmin" &&
    target !== "management" &&
    target !== "superadmin");

export function staffRoutes(app) {
  app.get(
    "/api/staff",
    requireRole("management", "superadmin"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT a.id,a.email,a.role,a.active,d.name AS department FROM accounts a LEFT JOIN departments d ON d.id=a.department_id WHERE a.role<>'member' ORDER BY a.id",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/staff",
    requireRole("management", "superadmin"),
    asyncRoute(async (req, res) => {
      const { email, password, role } = req.body;
      if (
        !roles.includes(role) ||
        !canManageRole(req.session.role, role) ||
        !/^\S+@\S+\.\S+$/.test(email || "") ||
        typeof password !== "string" ||
        password.length < 10
      )
        fail(400, "ข้อมูลพนักงานหรือสิทธิ์ไม่ถูกต้อง");
      const hash = await hashPassword(password);
      const id = await withTransaction(async (c) => {
        const [d] = await c.execute(
          "INSERT INTO departments (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
          [role],
        );
        const [result] = await c.execute(
          "INSERT INTO accounts (department_id,email,password_hash,role) VALUES (?,?,?,?)",
          [d.insertId, email.toLowerCase(), hash, role],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "create",
          entity: "account",
          entityId: result.insertId,
          after: { email, role },
        });
        return result.insertId;
      });
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/staff/:id",
    requireRole("management", "superadmin"),
    asyncRoute(async (req, res) => {
      await withTransaction(async (c) => {
        const [[before]] = await c.execute(
          "SELECT id,email,role,active FROM accounts WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!before || before.role === "member") fail(404, "ไม่พบพนักงาน");
        const role = req.body.role || before.role;
        if (
          !roles.includes(role) ||
          !canManageRole(req.session.role, before.role) ||
          !canManageRole(req.session.role, role)
        )
          fail(403, "ไม่มีสิทธิ์แก้ไขบทบาทนี้");
        const active =
          req.body.active === undefined
            ? before.active
            : Boolean(req.body.active);
        await c.execute("UPDATE accounts SET role=?,active=? WHERE id=?", [
          role,
          active,
          req.params.id,
        ]);
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "update",
          entity: "account",
          entityId: req.params.id,
          before,
          after: { ...before, role, active },
        });
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/audit",
    requireRole("management"),
    asyncRoute(async (req, res) => {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const [rows] = await pool.execute(
        "SELECT l.id,l.actor_id AS actorId,a.email AS actorEmail,l.action,l.entity,l.entity_id AS entityId,l.before_json AS beforeValue,l.after_json AS afterValue,l.reason,l.created_at AS createdAt FROM audit_logs l LEFT JOIN accounts a ON a.id=l.actor_id ORDER BY l.id DESC LIMIT ?",
        [limit],
      );
      res.json(rows);
    }),
  );
  app.get(
    "/api/audit/financial",
    requireRole("accounting", "management"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT l.id,l.actor_id AS actorId,a.email AS actorEmail,l.action,l.entity,l.entity_id AS entityId,l.before_json AS beforeValue,l.after_json AS afterValue,l.reason,l.created_at AS createdAt FROM audit_logs l LEFT JOIN accounts a ON a.id=l.actor_id WHERE l.entity IN ('payment','refund','booking','promotion') ORDER BY l.id DESC LIMIT 200",
      );
      res.json(rows);
    }),
  );
}
