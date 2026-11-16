import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

import { createApp } from "../app.js";
import {
  configFromEnvironment,
  resetTestDatabase
} from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("authentication API persists and restores customer and employee sessions", async () => {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const authConfig = {
    secret: "integration-test-secret-that-is-at-least-32-characters",
    tokenTtlSeconds: 900,
    cookieName: "tkc_session",
    secureCookie: false
  };
  const employeePassword = "EmployeePass123!";
  const employeeHash = await bcrypt.hash(employeePassword, 4);

  await pool.execute(
    `INSERT INTO Employee
       (department_name, role_name, name, email, password_hash, active)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    ["Front Office", "RECEPTION", "Reception Test", "reception@example.test", employeeHash]
  );

  const app = createApp({
    checkDatabase: async () => pool.query("SELECT 1"),
    pool,
    authConfig
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const registration = await jsonRequest(baseUrl, "/api/auth/register", {
      full_name: "  Test Guest  ",
      email: " GUEST@Example.Test ",
      phone: "0812345678",
      identity_type: "PASSPORT",
      identity_number: "AA123456",
      password: "CustomerPass123!"
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.body.data.principal.type, "customer");
    assert.equal(registration.body.data.principal.email, "guest@example.test");
    assert.equal(registration.body.data.principal.password_hash, undefined);
    const customerCookie = cookieFrom(registration.response);
    assert.match(customerCookie, /^tkc_session=/);
    assert.match(registration.response.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(registration.response.headers.get("set-cookie"), /SameSite=Strict/i);

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: customerCookie }
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).data.principal.fullName, "Test Guest");

    const duplicate = await jsonRequest(baseUrl, "/api/auth/register", {
      full_name: "Duplicate",
      email: "guest@example.test",
      phone: "0899999999",
      identity_type: "ID_CARD",
      identity_number: "9999999999999",
      password: "CustomerPass123!"
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.code, "EMAIL_IN_USE");

    const invalidLogin = await jsonRequest(baseUrl, "/api/auth/login", {
      account_type: "customer",
      email: "guest@example.test",
      password: "wrong-password"
    });
    assert.equal(invalidLogin.response.status, 401);
    assert.equal(invalidLogin.body.code, "INVALID_CREDENTIALS");

    const customerLogin = await jsonRequest(baseUrl, "/api/auth/login", {
      account_type: "customer",
      email: "guest@example.test",
      password: "CustomerPass123!"
    });
    assert.equal(customerLogin.response.status, 200);
    assert.equal(customerLogin.body.data.principal.role, "customer");

    const employeeLogin = await jsonRequest(baseUrl, "/api/auth/login", {
      account_type: "employee",
      email: "reception@example.test",
      password: employeePassword
    });
    assert.equal(employeeLogin.response.status, 200);
    assert.equal(employeeLogin.body.data.principal.role, "reception");
    const employeeCookie = cookieFrom(employeeLogin.response);

    const employeeMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: employeeCookie }
    });
    assert.equal(employeeMe.status, 200);
    assert.equal((await employeeMe.json()).data.principal.type, "employee");

    await pool.execute(
      "UPDATE Employee SET active = FALSE WHERE email = ?",
      ["reception@example.test"]
    );
    const inactiveMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: employeeCookie }
    });
    assert.equal(inactiveMe.status, 401);
    assert.equal((await inactiveMe.json()).code, "SESSION_INVALID");

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: customerCookie, Origin: baseUrl }
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie"), /tkc_session=;/);

    const [customers] = await pool.execute(
      "SELECT email, member_status, active, password_hash, last_login_at FROM Customer WHERE email = ?",
      ["guest@example.test"]
    );
    assert.equal(customers[0].member_status, "ACTIVE");
    assert.equal(customers[0].active, 1);
    assert.ok(customers[0].password_hash.startsWith("$2"));
    assert.ok(customers[0].last_login_at);

    await pool.execute(
      "UPDATE Customer SET member_status = 'SUSPENDED' WHERE email = ?",
      ["guest@example.test"]
    );
    const suspendedMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: customerCookie }
    });
    assert.equal(suspendedMe.status, 401);
    assert.equal((await suspendedMe.json()).code, "SESSION_INVALID");

    const [audits] = await pool.query(
      "SELECT action, after_data FROM AuditLog ORDER BY audit_log_id"
    );
    assert.ok(audits.some(({ action }) => action === "REGISTER"));
    assert.ok(audits.some(({ action }) => action === "LOGIN"));
    assert.doesNotMatch(JSON.stringify(audits), /CustomerPass123|EmployeePass123|password_hash|tkc_session/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
});

async function jsonRequest(baseUrl, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: baseUrl
    },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";", 1)[0];
}
