import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import {
  scrypt as scryptCallback,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { pool, withTransaction } from "./db.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

const scrypt = promisify(scryptCallback);
const MySQLStore = MySQLStoreFactory(session);
let sessionStore;

export function sessionMiddleware() {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET)
    throw new Error("SESSION_SECRET is required in production");
  sessionStore ||= new MySQLStore(
    { clearExpired: false, expiration: 1000 * 60 * 60 * 8 },
    pool,
  );
  return session({
    name: "tkc.sid",
    secret:
      process.env.SESSION_SECRET || "local-demo-secret-change-before-deploying",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [salt, hex] = encoded.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function failError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function requireUser(req, _res, next) {
  if (!req.session?.accountId) return next(failError(401, "กรุณาเข้าสู่ระบบ"));
  try {
    const [[account]] = await pool.execute(
      "SELECT role,active FROM accounts WHERE id=?",
      [req.session.accountId],
    );
    if (!account?.active) return next(failError(401, "กรุณาเข้าสู่ระบบใหม่"));
    req.session.role = account.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    requireUser(req, res, (error) => {
      if (error) return next(error);
      if (!roles.includes(req.session.role))
        return next(failError(403, "ไม่มีสิทธิ์ดำเนินการ"));
      next();
    });
  };
}

export function authRoutes(app) {
  app.post(
    "/api/auth/register",
    asyncRoute(async (req, res) => {
      const { fullName, phone, identityReference, email, password } =
        req.body || {};
      if (
        ![fullName, phone, identityReference, email, password].every(
          (x) => typeof x === "string" && x.trim(),
        )
      )
        fail(400, "กรุณากรอกข้อมูลให้ครบ");
      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        password.length < 10 ||
        fullName.length > 160 ||
        identityReference.length > 80
      )
        fail(400, "ข้อมูลสมัครสมาชิกไม่ถูกต้อง");
      const hash = await hashPassword(password);
      let accountId;
      try {
        accountId = await withTransaction(async (connection) => {
          const [customer] = await connection.execute(
            "INSERT INTO customers (full_name, phone, identity_reference) VALUES (?, ?, ?)",
            [fullName.trim(), phone.trim(), identityReference.trim()],
          );
          const [account] = await connection.execute(
            "INSERT INTO accounts (customer_id, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [customer.insertId, email.trim().toLowerCase(), hash, "member"],
          );
          await recordAudit(connection, {
            actorId: account.insertId,
            action: "register",
            entity: "account",
            entityId: account.insertId,
            after: { role: "member" },
          });
          return account.insertId;
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") fail(409, "อีเมลนี้มีบัญชีแล้ว");
        throw error;
      }
      await new Promise((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.accountId = accountId;
      req.session.role = "member";
      res.status(201).json({ id: accountId, role: "member" });
    }),
  );

  app.post(
    "/api/auth/login",
    asyncRoute(async (req, res) => {
      const { email, password } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string")
        fail(400, "กรุณากรอกอีเมลและรหัสผ่าน");
      const [rows] = await pool.execute(
        "SELECT id, password_hash, role, active FROM accounts WHERE email = ?",
        [email.trim().toLowerCase()],
      );
      if (
        !rows.length ||
        !rows[0].active ||
        !(await verifyPassword(password, rows[0].password_hash))
      )
        fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      await new Promise((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.accountId = rows[0].id;
      req.session.role = rows[0].role;
      res.json({ id: rows[0].id, role: rows[0].role });
    }),
  );

  app.post("/api/auth/logout", (req, res, next) =>
    req.session.destroy((error) =>
      error ? next(error) : (res.clearCookie("tkc.sid"), res.sendStatus(204)),
    ),
  );
  app.get(
    "/api/me",
    requireUser,
    asyncRoute(async (req, res) => {
      const [rows] = await pool.execute(
        "SELECT a.id, a.email, a.role, a.active, c.full_name AS fullName, c.phone, c.identity_reference AS identityReference FROM accounts a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.id=?",
        [req.session.accountId],
      );
      if (!rows.length || !rows[0].active) fail(401, "กรุณาเข้าสู่ระบบใหม่");
      res.json(rows[0]);
    }),
  );
}
