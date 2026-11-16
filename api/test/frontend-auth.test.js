import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("browser authentication uses the real API for register, login, restore, and logout", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  for (const route of [
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/me",
    "/api/auth/logout"
  ]) {
    assert.ok(source.includes(route), route);
  }
  assert.doesNotMatch(source, /ผ่านการตรวจฟอร์มสมัครในโหมดทดลอง/);
  assert.doesNotMatch(source, /เข้าสู่ระบบลูกค้าในโหมดทดลอง/);
});

test("browser room search uses the real room catalog and availability APIs", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  assert.match(source, /\/api\/room-types/);
  assert.match(source, /\/api\/rooms\/availability/);
  assert.doesNotMatch(source, /โหมดทดลองยังไม่ตรวจห้องว่างจริง/);
  assert.match(source, /record\.id/);
  assert.doesNotMatch(source, /find\(item => item\.name === record\.name\)/);
  assert.match(source, /โหลดประเภทห้องไม่สำเร็จ/);
  assert.match(source, /alt="\$\{escapeHtml\(room\.name\)\}"/);
});

test("browser booking flow creates and reloads customer bookings through the API", async () => {
  const [source, html] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8")
  ]);
  assert.match(source, /apiFetch\('\/api\/bookings'/);
  assert.match(source, /apiFetch\('\/api\/bookings\/mine\?limit=50'/);
  assert.match(source, /apiFetch\(`\/api\/bookings\/\$\{item\.id\}`/);
  assert.match(source, /data-cancel-booking/);
  assert.match(source, /ยอดรวมจากระบบ/);
  assert.match(html, /รายการนี้โหลดจากฐานข้อมูลและยังคงอยู่หลังรีเฟรชหน้าเว็บ/);
  assert.doesNotMatch(html, /id="slip-upload-input"[^>]*required/);
});

test("browser payment flow uses persistent proof, review, receipt, and summary APIs", async () => {
  const [source, html] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8")
  ]);
  for (const route of [
    "/api/accounting/payments?status=SUBMITTED",
    "/api/accounting/financial-summary",
    "/payment-proof",
    "/payment-proof/resubmit",
    "/api/staff/bookings/"
  ]) {
    assert.ok(source.includes(route), route);
  }
  assert.match(source, /new FormData/);
  assert.match(source, /\/approve/);
  assert.match(source, /\/reject/);
  assert.match(html, /id="reception-payment-form"/);
  assert.match(html, /id="accounting-financial-summary"/);
  assert.match(html, /id="executive-financial-summary"/);
  assert.doesNotMatch(source, /const demoBookings/);
  assert.doesNotMatch(source, /samplePayment/);
  assert.doesNotMatch(html, /data-review-sample/);
});

test("staff booking history loads live list and detail instead of fixed sample records", async () => {
  const [source, html] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8")
  ]);
  assert.ok(source.includes("/api/staff/bookings?page=1&limit=50"));
  assert.match(source, /apiFetch\(`\/api\/staff\/bookings\/\$\{bookingId\}`/);
  assert.match(source, /renderStaffBookingHistory/);
  assert.match(source, /booking\.customer\.fullName/);
  assert.match(html, /id="reception-booking-list"/);
  assert.match(source, /#reception-booking-list/);
  assert.doesNotMatch(source, /innerHTML = getBookingHistoryHTML/);
});

test("facility booking uses persistent service, attraction, and tour APIs", async () => {
  const [source, html] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8")
  ]);
  for (const route of ["/api/services", "/api/attractions", "/api/tours/rounds", "/tours", "/services"]) {
    assert.ok(source.includes(route), route);
  }
  assert.match(html, /id="facility-booking-room"/);
  assert.doesNotMatch(source, /ยกเลิกการจองบริการทดลองแล้ว/);
  assert.doesNotMatch(source, /ยืนยันการจองบริการทดลองแล้ว/);
  assert.ok(source.includes("/api/staff/promotions"));
  assert.ok(source.includes("/api/management/refunds"));
  assert.ok(source.includes("/refund-requests"));
  assert.ok(source.includes("/payout"));
  assert.match(html, /id="executive-refund-list"/);
  assert.match(html, /id="accounting-refund-list"/);
});

test("room operations UI uses persistent cleaning, damage, closure, and history APIs", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  for (const route of [
    "/api/housekeeping/cleaning",
    "/api/housekeeping/rooms/",
    "/api/management/damages",
    "/api/management/rooms/",
    "/api/management/room-closures/",
    "/history"
  ]) assert.ok(source.includes(route), route);
  assert.match(source, /new FormData\(apiDamageForm\)/);
  assert.match(source, /expectedVersion/);
});

test("review, chat, employee, and audit UI uses Phase 9 APIs", async () => {
  const [source, html] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8")
  ]);
  for (const route of ["/api/reviews", "/reviews", "/api/chat/messages", "/api/reception/chats", "/api/staff/employees", "/api/management/audit"]) {
    assert.ok(source.includes(route), route);
  }
  assert.match(html, /id="public-review-list"/);
  assert.match(html, /id="reception-chat-customer"/);
  assert.match(html, /id="executive-audit-list"/);
});
