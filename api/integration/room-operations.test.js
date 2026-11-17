import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { config as loadEnvironment } from "dotenv";
import mysql from "mysql2/promise";
import { createApp } from "../app.js";
import { configFromEnvironment, resetTestDatabase } from "../scripts/reset-test-db.js";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PNG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
loadEnvironment({ path: path.join(API_ROOT, ".env.test") });

test("cleaning completion respects an active closure and reopen restores availability", async () => {
  const fixture = await createFixture();
  try {
    const housekeeping = await fixture.employee("ops.housekeeping@example.test", "HOUSEKEEPING");
    const management = await fixture.employee("ops.management@example.test", "MANAGEMENT");
    const room = await fixture.room();
    await fixture.pool.execute("UPDATE Room SET current_status = 'NEEDS_CLEANING' WHERE room_id = ?", [room.id]);
    const [queued] = await fixture.pool.execute("INSERT INTO RoomEvent (room_id, event_type, status) VALUES (?, 'CLEANING_QUEUED', 'QUEUED')", [room.id]);
    const started = await fixture.post(housekeeping.cookie, `/api/housekeeping/cleaning/${queued.insertId}/start`, {});
    assert.equal(started.response.status, 200);
    const closure = await fixture.post(management.cookie, `/api/management/rooms/${room.id}/closures`, { expectedVersion: 0, reason: "Pipe repair", effectiveFrom: null, effectiveTo: null });
    assert.equal(closure.response.status, 201);
    const completed = await fixture.post(housekeeping.cookie, `/api/housekeeping/cleaning/${queued.insertId}/complete`, {});
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.data.roomStatus, "OUT_OF_SERVICE");
    const reopened = await fixture.post(management.cookie, `/api/management/room-closures/${closure.body.data.id}/reopen`, { expectedVersion: 2, reason: "Repair complete" });
    assert.equal(reopened.response.status, 200);
    assert.equal(reopened.body.data.roomStatus, "AVAILABLE");
    const history = await fixture.get(management.cookie, `/api/staff/rooms/${room.id}/history?page=1&limit=20`);
    assert.equal(history.response.status, 200);
    assert.deepEqual(history.body.data.map(({ eventType }) => eventType), ["ROOM_REOPENED","CLEANING_COMPLETED","ROOM_CLOSED","CLEANING_STARTED","CLEANING_QUEUED"]);
  } finally { await fixture.close(); }
});

test("damage photos stay private and review/resolve events preserve the report", async () => {
  const fixture = await createFixture();
  try {
    const housekeeping = await fixture.employee("ops.damage.housekeeping@example.test", "HOUSEKEEPING");
    const management = await fixture.employee("ops.damage.management@example.test", "MANAGEMENT");
    const room = await fixture.room();
    const form = new FormData();
    form.append("expectedVersion", "0"); form.append("item", "Mirror"); form.append("description", "Cracked corner");
    form.append("photo", new Blob([PNG], { type: "image/png" }), "damage.png");
    const report = await fixture.multipart(housekeeping.cookie, `/api/housekeeping/rooms/${room.id}/damages`, form);
    assert.equal(report.response.status, 201);
    assert.equal((await fixture.files()).length, 1);
    const publicFile = await fetch(`${fixture.baseUrl}/${report.body.data.photoReference}`);
    assert.equal(publicFile.status, 404);
    const photo = await fetch(`${fixture.baseUrl}/api/room-events/${report.body.data.id}/photo`, { headers: { Cookie: management.cookie } });
    assert.equal(photo.status, 200);
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), PNG);
    const review = await fixture.post(management.cookie, `/api/management/damages/${report.body.data.id}/review`, { reason: "Needs replacement" });
    assert.equal(review.response.status, 201);
    const resolve = await fixture.post(management.cookie, `/api/management/damages/${report.body.data.id}/resolve`, { reason: "Mirror replaced" });
    assert.equal(resolve.response.status, 201);
    const [[original]] = await fixture.pool.execute("SELECT event_type AS type, item, description, photo_reference AS photo FROM RoomEvent WHERE room_event_id = ?", [report.body.data.id]);
    assert.deepEqual(original, { type: "DAMAGE_REPORTED", item: "Mirror", description: "Cracked corner", photo: report.body.data.photoReference });
  } finally { await fixture.close(); }
});

test("concurrent closures enforce one optimistic room version winner", async () => {
  const fixture = await createFixture();
  try {
    const management = await fixture.employee("ops.race.management@example.test", "MANAGEMENT");
    const room = await fixture.room();
    const results = await Promise.all([
      fixture.post(management.cookie, `/api/management/rooms/${room.id}/closures`, { expectedVersion: 0, reason: "Repair A", effectiveFrom: null, effectiveTo: null }),
      fixture.post(management.cookie, `/api/management/rooms/${room.id}/closures`, { expectedVersion: 0, reason: "Repair B", effectiveFrom: null, effectiveTo: null })
    ]);
    assert.deepEqual(results.map(({ response }) => response.status).sort(), [201,409]);
  } finally { await fixture.close(); }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment(); await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig); const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tkc-room-ops-"));
  const app = createApp({ checkDatabase: async () => pool.query("SELECT 1"), pool, storageRoot,
    authConfig: { secret: "room-operation-secret-at-least-32-characters", tokenTtlSeconds: 900, cookieName: "tkc_session", secureCookie: false } });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (cookie, pathname, method = "GET", body) => { const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { ...(body ? { "content-type": "application/json", Origin: baseUrl } : {}), Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { response, body: await response.json() }; };
  return { pool, baseUrl,
    async employee(email, role) { const password = "RoomOpsEmployee123!"; await pool.execute("INSERT INTO Employee (department_name, role_name, name, email, password_hash, active) VALUES ('Hotel', ?, 'Room Ops', ?, ?, TRUE)", [role, email, await bcrypt.hash(password, 4)]); const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", Origin: baseUrl }, body: JSON.stringify({ account_type: "employee", email, password }) }); return { cookie: response.headers.get("set-cookie").split(";", 1)[0] }; },
    async room() { const [[row]] = await pool.execute("SELECT room_id AS id, room_code AS code FROM Room WHERE current_status = 'AVAILABLE' ORDER BY room_id LIMIT 1"); return { id: Number(row.id), code: row.code }; },
    post: (cookie, pathname, body) => request(cookie, pathname, "POST", body), get: (cookie, pathname) => request(cookie, pathname),
    async multipart(cookie, pathname, body) { const response = await fetch(`${baseUrl}${pathname}`, { method: "POST", headers: { Origin: baseUrl, Cookie: cookie }, body }); return { response, body: await response.json() }; },
    async files() { try { return await readdir(path.join(storageRoot, "damages")); } catch { return []; } },
    async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); }
  };
}
