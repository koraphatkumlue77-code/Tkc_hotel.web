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

test("refund lifecycle preserves incoming money and creates one bounded outgoing payout", async () => {
  const fixture = await createFixture();
  try {
    const accounting = await fixture.employee("refund.accounting@example.test", "ACCOUNTING");
    const management = await fixture.employee("refund.management@example.test", "MANAGEMENT");
    const reception = await fixture.employee("refund.reception@example.test", "RECEPTION");
    const source = await fixture.sourcePayment("1000.00");
    const denied = await fixture.post(reception.cookie, `/api/accounting/payments/${source.paymentId}/refund-requests`, { amount: "200.00", reason: "Denied role" });
    assert.equal(denied.response.status, 403);
    const request = await fixture.post(accounting.cookie, `/api/accounting/payments/${source.paymentId}/refund-requests`, { amount: "600.00", reason: "Guest cancellation" });
    assert.equal(request.response.status, 201);
    assert.equal(request.body.data.status, "PENDING");
    const over = await fixture.post(accounting.cookie, `/api/accounting/payments/${source.paymentId}/refund-requests`, { amount: "500.00", reason: "Too much" });
    assert.equal(over.response.status, 409);
    assert.equal(over.body.code, "REFUND_EXCEEDS_AVAILABLE");
    const approved = await fixture.post(management.cookie, `/api/management/refunds/${request.body.data.id}/approve`, { reason: "Approved" });
    assert.equal(approved.response.status, 200);
    const payouts = await Promise.all([
      fixture.post(accounting.cookie, `/api/accounting/refunds/${request.body.data.id}/payout`, { method: "BANK_TRANSFER", idempotencyKey: "PAYOUT-A" }),
      fixture.post(accounting.cookie, `/api/accounting/refunds/${request.body.data.id}/payout`, { method: "BANK_TRANSFER", idempotencyKey: "PAYOUT-B" })
    ]);
    assert.deepEqual(payouts.map(({ response }) => response.status).sort(), [201, 409]);
    const [[sourceAfter]] = await fixture.pool.execute("SELECT transaction_type AS type, direction, status, CAST(amount AS CHAR) AS amount FROM Payment WHERE payment_id = ?", [source.paymentId]);
    assert.deepEqual(sourceAfter, { type: "FULL_PAYMENT", direction: "IN", status: "VERIFIED", amount: "1000.00" });
    const [[outgoing]] = await fixture.pool.execute("SELECT COUNT(*) AS count, CAST(SUM(amount) AS CHAR) AS amount FROM Payment WHERE transaction_type = 'REFUND_PAYOUT'");
    assert.equal(Number(outgoing.count), 1);
    assert.equal(outgoing.amount, "600.00");
  } finally { await fixture.close(); }
});

test("management rejection is final and cannot be paid", async () => {
  const fixture = await createFixture();
  try {
    const accounting = await fixture.employee("refund.reject.accounting@example.test", "ACCOUNTING");
    const management = await fixture.employee("refund.reject.management@example.test", "MANAGEMENT");
    const source = await fixture.sourcePayment("500.00");
    const request = await fixture.post(accounting.cookie, `/api/accounting/payments/${source.paymentId}/refund-requests`, { amount: "100.00", reason: "Request" });
    const rejected = await fixture.post(management.cookie, `/api/management/refunds/${request.body.data.id}/reject`, { reason: "Not eligible" });
    assert.equal(rejected.body.data.status, "REJECTED");
    const repeat = await fixture.post(management.cookie, `/api/management/refunds/${request.body.data.id}/approve`, { reason: "Changed mind" });
    assert.equal(repeat.response.status, 409);
    const payout = await fixture.post(accounting.cookie, `/api/accounting/refunds/${request.body.data.id}/payout`, { method: "CASH", idempotencyKey: "REJECTED-PAYOUT" });
    assert.equal(payout.response.status, 409);
  } finally { await fixture.close(); }
});

async function createFixture() {
  const databaseConfig = configFromEnvironment(); await resetTestDatabase(databaseConfig);
  const pool = mysql.createPool(databaseConfig);
  const app = createApp({ checkDatabase: async () => pool.query("SELECT 1"), pool,
    authConfig: { secret: "refund-integration-secret-at-least-32-characters", tokenTtlSeconds: 900, cookieName: "tkc_session", secureCookie: false } });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`; let sequence = 0;
  return { pool, baseUrl,
    async employee(email, role) {
      const password = "RefundEmployee123!";
      const [result] = await pool.execute("INSERT INTO Employee (department_name, role_name, name, email, password_hash, active) VALUES ('Hotel', ?, 'Refund Staff', ?, ?, TRUE)", [role, email, await bcrypt.hash(password, 4)]);
      const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", Origin: baseUrl }, body: JSON.stringify({ account_type: "employee", email, password }) });
      return { id: Number(result.insertId), cookie: response.headers.get("set-cookie").split(";", 1)[0] };
    },
    async sourcePayment(amount) {
      sequence += 1;
      const [customer] = await pool.execute("INSERT INTO Customer (full_name, email, phone, identity_type, identity_number, member_status, active) VALUES ('Refund Guest', ?, '0844444444', 'ID_CARD', ?, 'WALK_IN', TRUE)", [`refund.guest.${sequence}@example.test`, `REFUND-${sequence}`]);
      const date = bangkokDate();
      const [booking] = await pool.execute(`INSERT INTO Booking (booking_code, customer_id, status, channel, check_in_date, check_out_date, deposit_rate, room_subtotal_snapshot, service_subtotal_snapshot, discount_total_snapshot, total_snapshot) VALUES (?, ?, 'CANCELLED', 'ONLINE', ?, DATE_ADD(?, INTERVAL 1 DAY), 100, ?, 0, 0, ?)`, [`RF-${Date.now().toString(36)}-${sequence}`, customer.insertId, date, date, amount, amount]);
      const [payment] = await pool.execute("INSERT INTO Payment (booking_id, transaction_type, direction, method, amount, status, submitted_at, verified_at) VALUES (?, 'FULL_PAYMENT', 'IN', 'BANK_TRANSFER', ?, 'VERIFIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [booking.insertId, amount]);
      return { bookingId: Number(booking.insertId), paymentId: Number(payment.insertId) };
    },
    async post(cookie, pathname, body) { const response = await fetch(`${baseUrl}${pathname}`, { method: "POST", headers: { "content-type": "application/json", Origin: baseUrl, Cookie: cookie }, body: JSON.stringify(body) }); return { response, body: await response.json() }; },
    async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); }
  };
}
function bangkokDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
