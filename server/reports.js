import { pool, withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export async function financialReport(connection) {
  const [[received]] = await connection.query(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE status='approved'",
  );
  const [[refunded]] = await connection.query(
    "SELECT COALESCE(SUM(amount),0) AS amount FROM refunds WHERE status='recorded'",
  );
  const [[pending]] = await connection.query(
    "SELECT COUNT(*) AS amount FROM payments WHERE status='pending_review'",
  );
  return {
    received: Number(received.amount),
    refunded: Number(refunded.amount),
    net: Number(received.amount) - Number(refunded.amount),
    pendingReviews: Number(pending.amount),
    simulated: true,
  };
}

export function reportRoutes(app) {
  app.get(
    "/api/reports/financial",
    requireRole("accounting", "management"),
    asyncRoute(async (_req, res) => res.json(await financialReport(pool))),
  );
  app.get(
    "/api/reports/overview",
    requireRole("management", "superadmin", "reception"),
    asyncRoute(async (_req, res) => {
      const [[rooms]] = await pool.query(
        "SELECT COUNT(*) AS total,SUM(status='ready') AS ready,SUM(status='occupied') AS occupied,SUM(status='dirty') AS dirty,SUM(status='repair') AS repair FROM rooms",
      );
      const [bookings] = await pool.query(
        "SELECT status,COUNT(*) AS amount FROM bookings GROUP BY status",
      );
      const finance = await financialReport(pool);
      res.json({
        rooms,
        bookings: Object.fromEntries(bookings.map((x) => [x.status, x.amount])),
        finance,
      });
    }),
  );
  app.get(
    "/api/promotions",
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT id,name,percent_off AS percentOff,priority,start_date AS startDate,end_date AS endDate,min_nights AS minNights,min_rooms AS minRooms,active FROM promotions ORDER BY priority,id",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/promotions",
    requireRole("management"),
    asyncRoute(async (req, res) => {
      const {
        name,
        percentOff,
        priority = 100,
        startDate,
        endDate,
        minNights = 1,
        minRooms = 1,
      } = req.body;
      if (
        !name?.trim() ||
        !(Number(percentOff) > 0 && Number(percentOff) <= 100) ||
        !startDate ||
        !endDate ||
        endDate < startDate ||
        minNights < 1 ||
        minRooms < 1
      )
        fail(400, "โปรโมชั่นไม่ถูกต้อง");
      const id = await withTransaction(async (c) => {
        const [result] = await c.execute(
          "INSERT INTO promotions (name,percent_off,priority,start_date,end_date,min_nights,min_rooms) VALUES (?,?,?,?,?,?,?)",
          [name, percentOff, priority, startDate, endDate, minNights, minRooms],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "create",
          entity: "promotion",
          entityId: result.insertId,
          after: req.body,
        });
        return result.insertId;
      });
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/promotions/:id",
    requireRole("management"),
    asyncRoute(async (req, res) => {
      const columns = {
        name: "name",
        percentOff: "percent_off",
        priority: "priority",
        startDate: "start_date",
        endDate: "end_date",
        minNights: "min_nights",
        minRooms: "min_rooms",
        active: "active",
      };
      const keys = Object.keys(req.body).filter((x) => columns[x]);
      if (!keys.length) fail(400, "ไม่มีข้อมูลให้แก้");
      await withTransaction(async (c) => {
        const [[before]] = await c.execute(
          "SELECT * FROM promotions WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!before) fail(404, "ไม่พบโปรโมชั่น");
        await c.execute(
          `UPDATE promotions SET ${keys.map((k) => `${columns[k]}=?`).join(",")} WHERE id=?`,
          [...keys.map((k) => req.body[k]), req.params.id],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "update",
          entity: "promotion",
          entityId: req.params.id,
          before,
          after: req.body,
        });
      });
      res.json({ ok: true });
    }),
  );
}
