import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { config as loadEnvironment } from "dotenv";
import mysql from "mysql2/promise";
import { createApp } from "../app.js";
import { configFromEnvironment, resetTestDatabase } from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("authorized staff create/update promotions while Reception is denied", async () => {
  const fixture = await createFixture();
  try {
    const management = await fixture.employee("promo.manager@example.test", "MANAGEMENT");
    const reception = await fixture.employee("promo.reception@example.test", "RECEPTION");
    const input = {
      code: "stay20", name: "Stay twenty", discountPercent: "20.00", priority: 2,
      validFrom: null, validUntil: null, active: true
    };
    const denied = await fixture.post(reception, "/api/staff/promotions", input);
    assert.equal(denied.response.status, 403);
    const created = await fixture.post(management, "/api/staff/promotions", input);
    assert.equal(created.response.status, 201);
    assert.equal(created.body.data.code, "STAY20");
    const updated = await fixture.patch(management, `/api/staff/promotions/${created.body.data.id}`, {
      ...input, name: "Stay twenty updated", active: false
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.data.active, false);
    const listResponse = await fetch(`${fixture.baseUrl}/api/staff/promotions`, { headers: { Cookie: management.cookie } });
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.data[0].name, "Stay twenty updated");
  } finally { await fixture.close(); }
});

test("visible attractions are public and staff updates preserve Service identity", async () => {
  const fixture = await createFixture();
  try {
    const superadmin = await fixture.employee("attraction.admin@example.test", "SUPERADMIN");
    const input = {
      name: "Sunset Point", description: "View near the beach", imageReference: "/images/sunset.jpg",
      season: "ALL_YEAR", schedule: { daily: "18:00" }, visible: true, active: true
    };
    const created = await fixture.post(superadmin, "/api/staff/attractions", input);
    assert.equal(created.response.status, 201);
    const publicResponse = await fetch(`${fixture.baseUrl}/api/attractions`);
    const publicBody = await publicResponse.json();
    assert.equal(publicResponse.status, 200);
    assert.equal(publicBody.data[0].name, "Sunset Point");
    const updated = await fixture.patch(superadmin, `/api/staff/attractions/${created.body.data.id}`, {
      ...input, visible: false
    });
    assert.equal(updated.response.status, 200);
    const hiddenResponse = await fetch(`${fixture.baseUrl}/api/attractions`);
    assert.equal((await hiddenResponse.json()).data.length, 0);
  } finally { await fixture.close(); }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment();
  await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({ checkDatabase: async () => pool.query("SELECT 1"), pool,
    authConfig: { secret: "promotion-integration-secret-at-least-32-characters", tokenTtlSeconds: 900, cookieName: "tkc_session", secureCookie: false } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(session, method, pathname, body) {
    const response = await fetch(`${baseUrl}${pathname}`, { method,
      headers: { "content-type": "application/json", Origin: baseUrl, Cookie: session.cookie }, body: JSON.stringify(body) });
    return { response, body: await response.json() };
  }
  return { pool, baseUrl,
    async employee(email, role) {
      const password = "PromotionEmployee123!";
      await pool.execute("INSERT INTO Employee (department_name, role_name, name, email, password_hash, active) VALUES ('Hotel', ?, 'Catalog Staff', ?, ?, TRUE)", [role, email, await bcrypt.hash(password, 4)]);
      const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", Origin: baseUrl }, body: JSON.stringify({ account_type: "employee", email, password }) });
      assert.equal(response.status, 200);
      return { cookie: response.headers.get("set-cookie").split(";", 1)[0] };
    },
    post: (session, pathname, body) => request(session, "POST", pathname, body),
    patch: (session, pathname, body) => request(session, "PATCH", pathname, body),
    async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); }
  };
}
