import { pool, withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export async function createReview(
  connection,
  { bookingId, accountId, rating, content },
) {
  if (
    !Number.isInteger(Number(rating)) ||
    rating < 1 ||
    rating > 5 ||
    typeof content !== "string" ||
    !content.trim() ||
    content.length > 2000
  )
    fail(400, "รีวิวไม่ถูกต้อง");
  const [[booking]] = await connection.execute(
    "SELECT account_id,status FROM bookings WHERE id=?",
    [bookingId],
  );
  if (
    !booking ||
    Number(booking.account_id) !== Number(accountId) ||
    !["checked_in", "checked_out"].includes(booking.status)
  )
    fail(403, "รีวิวได้หลัง Check-in เฉพาะสมาชิกผู้จอง");
  const [result] = await connection.execute(
    "INSERT INTO reviews (booking_id,account_id,rating,content) VALUES (?,?,?,?)",
    [bookingId, accountId, rating, content.trim()],
  );
  await recordAudit(connection, {
    actorId: accountId,
    action: "create",
    entity: "review",
    entityId: result.insertId,
    after: { bookingId, rating, content: content.trim() },
  });
  return result.insertId;
}

export function contentRoutes(app) {
  app.get(
    "/api/reviews",
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT r.id,r.rating,r.content,r.created_at AS createdAt,c.full_name AS reviewerName FROM reviews r JOIN bookings b ON b.id=r.booking_id JOIN customers c ON c.id=b.customer_id WHERE r.visible=1 ORDER BY r.id DESC LIMIT 30",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/reviews",
    requireRole("member"),
    asyncRoute(async (req, res) => {
      const id = await withTransaction((c) =>
        createReview(c, {
          bookingId: req.body.bookingId,
          accountId: req.session.accountId,
          rating: req.body.rating,
          content: req.body.content,
        }),
      );
      res.status(201).json({ id });
    }),
  );
  app.post(
    "/api/reviews/:id/hide",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      if (!req.body.reason?.trim()) fail(400, "ต้องระบุเหตุผล");
      await withTransaction(async (c) => {
        const [[before]] = await c.execute(
          "SELECT * FROM reviews WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!before) fail(404, "ไม่พบรีวิว");
        await c.execute(
          "UPDATE reviews SET visible=0,hidden_reason=?,hidden_by=?,hidden_at=NOW() WHERE id=?",
          [req.body.reason, req.session.accountId, req.params.id],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "hide",
          entity: "review",
          entityId: req.params.id,
          before,
          after: { visible: false },
          reason: req.body.reason,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/attractions",
    asyncRoute(async (req, res) => {
      const season = req.query.season;
      const [rows] = season
        ? await pool.execute(
            "SELECT * FROM attractions WHERE visible=1 AND season=? ORDER BY id DESC",
            [season],
          )
        : await pool.query(
            "SELECT * FROM attractions WHERE visible=1 ORDER BY id DESC",
          );
      res.json(rows);
    }),
  );
  app.get(
    "/api/attractions/all",
    requireRole("superadmin", "management"),
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT * FROM attractions ORDER BY id DESC",
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/attractions",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      const {
        name,
        description,
        season,
        imageUrl = null,
        visible = true,
      } = req.body;
      if (!name?.trim() || !description?.trim() || !season?.trim())
        fail(400, "ข้อมูลสถานที่ไม่ครบ");
      const id = await withTransaction(async (c) => {
        const [result] = await c.execute(
          "INSERT INTO attractions (name,description,season,image_url,visible) VALUES (?,?,?,?,?)",
          [name, description, season, imageUrl, visible],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "create",
          entity: "attraction",
          entityId: result.insertId,
          after: req.body,
        });
        return result.insertId;
      });
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/attractions/:id",
    requireRole("superadmin"),
    asyncRoute(async (req, res) => {
      const columns = {
        name: "name",
        description: "description",
        season: "season",
        imageUrl: "image_url",
        visible: "visible",
      };
      const keys = Object.keys(req.body).filter((x) => columns[x]);
      if (!keys.length) fail(400, "ไม่มีข้อมูลให้แก้");
      await withTransaction(async (c) => {
        const [[before]] = await c.execute(
          "SELECT * FROM attractions WHERE id=? FOR UPDATE",
          [req.params.id],
        );
        if (!before) fail(404, "ไม่พบสถานที่");
        await c.execute(
          `UPDATE attractions SET ${keys.map((k) => `${columns[k]}=?`).join(",")} WHERE id=?`,
          [...keys.map((k) => req.body[k]), req.params.id],
        );
        await recordAudit(c, {
          actorId: req.session.accountId,
          action: "update",
          entity: "attraction",
          entityId: req.params.id,
          before,
          after: req.body,
        });
      });
      res.json({ ok: true });
    }),
  );
}
