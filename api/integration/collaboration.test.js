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

test("checked-out owner reviews once and Superadmin moderation removes it publicly", async () => {
  const fixture = await createFixture();
  try {
    const customer = await fixture.customer("review.owner@example.test", "REVIEW-OWNER");
    const other = await fixture.customer("review.other@example.test", "REVIEW-OTHER");
    const admin = await fixture.employee("review.admin@example.test", "SUPERADMIN");
    const booking = await fixture.booking(customer.id, "CHECKED_OUT");
    const denied = await fixture.post(other.cookie, `/api/bookings/${booking.id}/reviews`, { rating: 5, content: "Not mine" });
    assert.equal(denied.response.status, 404);
    const created = await fixture.post(customer.cookie, `/api/bookings/${booking.id}/reviews`, { rating: 5, content: "Excellent stay" });
    assert.equal(created.response.status, 201);
    const duplicate = await fixture.post(customer.cookie, `/api/bookings/${booking.id}/reviews`, { rating: 4, content: "Again" });
    assert.equal(duplicate.response.status, 409);
    const publicBefore = await fixture.get(null, "/api/reviews?page=1&limit=10");
    assert.equal(publicBefore.body.data.length, 1);
    const hidden = await fixture.post(admin.cookie, `/api/staff/reviews/${created.body.data.id}/hide`, { reason: "Contains private details" });
    assert.equal(hidden.response.status, 200);
    const publicAfter = await fixture.get(null, "/api/reviews?page=1&limit=10");
    assert.equal(publicAfter.body.data.length, 0);
  } finally { await fixture.close(); }
});

test("customer and Reception chat is owner-scoped and marks incoming messages read", async () => {
  const fixture = await createFixture();
  try {
    const customer = await fixture.customer("chat.owner@example.test", "CHAT-OWNER");
    const other = await fixture.customer("chat.other@example.test", "CHAT-OTHER");
    const reception = await fixture.employee("chat.reception@example.test", "RECEPTION");
    const sent = await fixture.post(customer.cookie, "/api/chat/messages", { message: "Need an extra towel" });
    assert.equal(sent.response.status, 201);
    const otherMessages = await fixture.get(other.cookie, "/api/chat/messages?after=0&limit=50");
    assert.equal(otherMessages.body.data.length, 0);
    const conversations = await fixture.get(reception.cookie, "/api/reception/chats?page=1&limit=20");
    assert.equal(conversations.body.data[0].unreadCount, 1);
    const thread = await fixture.get(reception.cookie, `/api/reception/chats/${customer.id}/messages?after=0&limit=50`);
    assert.equal(thread.body.data[0].message, "Need an extra towel");
    const reply = await fixture.post(reception.cookie, `/api/reception/chats/${customer.id}/messages`, { message: "We will deliver it" });
    assert.equal(reply.response.status, 201);
    const ownerMessages = await fixture.get(customer.cookie, "/api/chat/messages?after=0&limit=50");
    assert.deepEqual(ownerMessages.body.data.map(({ senderType }) => senderType), ["CUSTOMER","EMPLOYEE"]);
    assert.ok(ownerMessages.body.data[0].readAt);
  } finally { await fixture.close(); }
});

test("employee management hashes passwords, protects Superadmin, and appears in filtered audit", async () => {
  const fixture = await createFixture();
  try {
    const manager = await fixture.employee("employee.manager@example.test", "MANAGEMENT");
    const admin = await fixture.employee("employee.admin@example.test", "SUPERADMIN");
    const created = await fixture.post(manager.cookie, "/api/staff/employees", { name: "New Reception", email: "new.reception@example.test", department: "Front", role: "RECEPTION", active: true, password: "NewReception123!" });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.data.role, "reception");
    const [[stored]] = await fixture.pool.execute("SELECT password_hash AS hash FROM Employee WHERE employee_id = ?", [created.body.data.id]);
    assert.notEqual(stored.hash, "NewReception123!");
    assert.equal(await bcrypt.compare("NewReception123!", stored.hash), true);
    const forbidden = await fixture.patch(manager.cookie, `/api/staff/employees/${admin.id}`, { name: "Admin", email: "employee.admin@example.test", department: "Hotel", role: "SUPERADMIN", active: false });
    assert.equal(forbidden.response.status, 403);
    const self = await fixture.patch(manager.cookie, `/api/staff/employees/${manager.id}`, { name: "Manager", email: "employee.manager@example.test", department: "Hotel", role: "MANAGEMENT", active: false });
    assert.equal(self.response.status, 409);
    const audit = await fixture.get(manager.cookie, `/api/management/audit?entityType=Employee&employeeId=${manager.id}&page=1&limit=20`);
    assert.equal(audit.response.status, 200);
    assert.ok(audit.body.data.some(({ action }) => action === "EMPLOYEE_CREATED"));
    assert.doesNotMatch(JSON.stringify(audit.body), /NewReception123/);
  } finally { await fixture.close(); }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment(); await resetTestDatabase(databaseConfig); const pool = mysql.createPool(databaseConfig);
  const app = createApp({ checkDatabase: async () => pool.query("SELECT 1"), pool,
    authConfig: { secret: "collaboration-secret-at-least-32-characters", tokenTtlSeconds: 900, cookieName: "tkc_session", secureCookie: false } });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); }); const baseUrl = `http://127.0.0.1:${server.address().port}`; let seq = 0;
  async function request(cookie, pathname, method = "GET", body) { const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { ...(body ? { "content-type": "application/json", Origin: baseUrl } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { response, body: await response.json() }; }
  return { pool, baseUrl, get: (cookie,path) => request(cookie,path), post: (cookie,path,body) => request(cookie,path,"POST",body), patch: (cookie,path,body) => request(cookie,path,"PATCH",body),
    async customer(email, identity) { const result = await request(null,"/api/auth/register","POST",{ full_name:"Collab Guest",email,phone:"0855555555",identity_type:"ID_CARD",identity_number:identity,password:"CollabGuest123!" }); return { id:result.body.data.principal.id,cookie:result.response.headers.get("set-cookie").split(";",1)[0] }; },
    async employee(email, role) { const password="CollabEmployee123!"; const [insert] = await pool.execute("INSERT INTO Employee (department_name, role_name, name, email, password_hash, active) VALUES ('Hotel', ?, 'Collab Staff', ?, ?, TRUE)",[role,email,await bcrypt.hash(password,4)]); const result=await request(null,"/api/auth/login","POST",{account_type:"employee",email,password}); return {id:Number(insert.insertId),cookie:result.response.headers.get("set-cookie").split(";",1)[0]}; },
    async booking(customerId,status) { seq+=1; const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); const [result]=await pool.execute("INSERT INTO Booking (booking_code,customer_id,status,channel,check_in_date,check_out_date,deposit_rate,room_subtotal_snapshot,service_subtotal_snapshot,discount_total_snapshot,total_snapshot) VALUES (?, ?, ?, 'ONLINE', DATE_SUB(?, INTERVAL 2 DAY), DATE_SUB(?, INTERVAL 1 DAY), 100,1000,0,0,1000)",[`COL-${Date.now().toString(36)}-${seq}`,customerId,status,day,day]); await pool.execute("INSERT INTO BookingRoom (booking_id,room_type_id,guest_count,nightly_rate_snapshot,net_amount) VALUES (?,1,1,1000,1000)",[result.insertId]); return {id:Number(result.insertId)}; },
    async close() { await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())); await pool.end(); }
  };
}
