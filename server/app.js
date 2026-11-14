import express from "express";
import { resolve } from "node:path";
import { pool } from "./db.js";
import { authRoutes, sessionMiddleware, requireRole } from "./auth.js";
import { roomRoutes } from "./rooms.js";
import { bookingRoutes } from "./bookings.js";
import { paymentRoutes } from "./payments.js";
import { tourRoutes } from "./tours.js";
import { stayRoutes } from "./stays.js";
import { housekeepingRoutes } from "./housekeeping.js";
import { refundRoutes } from "./refunds.js";
import { staffRoutes } from "./staff.js";
import { reportRoutes } from "./reports.js";
import { contentRoutes } from "./content.js";
import { chatRoutes } from "./chat.js";
import { serviceRoutes } from "./services.js";
import { uploadRoutes } from "./uploads.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("origin")) {
      try {
        if (new URL(req.get("origin")).host !== req.get("host"))
          return res.status(403).json({ error: "คำขอข้ามเว็บไซต์ถูกปฏิเสธ" });
      } catch {
        return res.status(403).json({ error: "คำขอข้ามเว็บไซต์ถูกปฏิเสธ" });
      }
    }
    next();
  });
  app.use(sessionMiddleware());
  authRoutes(app);
  roomRoutes(app);
  bookingRoutes(app);
  paymentRoutes(app);
  tourRoutes(app);
  stayRoutes(app);
  housekeepingRoutes(app);
  refundRoutes(app);
  staffRoutes(app);
  reportRoutes(app);
  contentRoutes(app);
  chatRoutes(app);
  serviceRoutes(app);
  uploadRoutes(app);
  app.get("/api/health", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
  app.get("/staff/:role.html", (req, res, next) => {
    if (
      ![
        "superadmin",
        "reception",
        "accounting",
        "management",
        "housekeeping",
      ].includes(req.params.role)
    )
      return next();
    res.sendFile(resolve("public/staff/workspace.html"));
  });
  app.get("/favicon.ico", (_req, res) => res.redirect("/favicon.svg"));
  app.use(express.static(resolve("public")));
  app.use("/api", (_req, res) => res.status(404).json({ error: "ไม่พบ API" }));
  app.use((error, _req, res, _next) => {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    if (error.code === "LIMIT_FILE_SIZE")
      return res.status(413).json({ error: "ไฟล์เกิน 2 MB" });
    console.error(error);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดของระบบ" });
  });
  return app;
}
