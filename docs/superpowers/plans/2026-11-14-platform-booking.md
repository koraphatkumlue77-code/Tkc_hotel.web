# TKC Platform and Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างฐานระบบสมาชิก ห้องพัก ราคา และการกันห้องที่หลายคนใช้พร้อมกันได้บน MySQL

**Architecture:** หน้า HTML/JavaScript เรียก Express API; API ตรวจสิทธิ์และกฎ แล้วใช้ MySQL transaction สำหรับข้อมูลที่มีการแข่งขันกัน การเปลี่ยนข้อมูลทุกจุดเขียน audit log ใน transaction เดียวกัน

**Tech Stack:** Node.js 24, ES modules, Express 5, mysql2, express-session, express-mysql-session, MySQL 8.4, Node built-in test runner; frontend ยังเป็น HTML/CSS/JavaScript

**Spec:** `docs/superpowers/specs/2026-11-14-tkc-hotel-web-system-design.md` และ `docs/reference/TKC_Requirements_Business_Rules_TH.docx`

## Global Constraints

- DOCX เป็นข้อกำหนดหลัก; PDF/Figma/เว็บเดิมเป็นข้อมูลประกอบ
- มีโรงแรมจำลองหนึ่งแห่ง ห้อง 800 ห้องตามรหัสและจำนวนใน BR-1 ถึง BR-5
- ข้อมูลส่วนตัวของผู้ทดลองเป็นข้อมูลสมมติ; ไม่รับเงินจริง
- ต้องตรวจสิทธิ์และกฎที่ server; browser ไม่เป็นแหล่งข้อมูลหลัก
- หน้าเว็บยังใช้ HTML/CSS/vanilla JavaScript; ไม่ใช้ React, Tailwind, TypeScript
- ไฟล์ที่เพิ่มต้องแยกหน้าที่ชัดและใช้ dependency เท่าที่จำเป็นตาม Ponytail

## Review Focus

1. ช่วงวัน `[checkIn, checkOut)`: การจองที่วันออกเท่ากับวันเข้าอีกใบไม่ถือว่าทับกัน — ทดสอบใน Task 3
2. ผู้ใช้สองคนจองห้องสุดท้ายพร้อมกัน: ยืนยันได้หนึ่งคน — ทดสอบใน Task 5
3. คนหมดอายุ session แต่ยังเปิดหน้าจออยู่: API ต้องตอบ 401 และไม่เปลี่ยนข้อมูล — ทดสอบใน Task 2
4. โปรโมชั่นสองรายการต้องลดค่าห้องตามลำดับ ไม่ลดค่าบริการ — ทดสอบใน Task 4
5. ข้อมูลตัวตนสมมติที่กรอกมีอักขระพิเศษ: แสดงกลับโดยไม่เกิด script injection — ทดสอบใน Task 2 และแผน frontend

## File Map

- `package.json`, `compose.yaml`, `.env.example`, `README.md`: คำสั่งรัน local และ dependency
- `server/app.js`, `server/db.js`, `server/errors.js`: Express, pool/transaction, error mapping
- `server/auth.js`, `server/rooms.js`, `server/pricing.js`, `server/bookings.js`, `server/audit.js`: โมดูลตามโดเมน
- `db/migrations/*.sql`, `db/migrate.js`, `db/seed.js`: schema, migration และข้อมูลเริ่มต้น
- `test/*.test.js`: unit/integration tests ด้วย `node:test`

## Cross-Plan Requirement Map

| DOCX rules | Owning tasks |
| --- | --- |
| BR-1–5 | Plan 1 Tasks 1, 3; Plan 2 Task 4 |
| BR-6–14 | Plan 1 Tasks 3, 5; Plan 2 Task 3 |
| BR-15–18 | Plan 2 Tasks 1, 2 |
| BR-19–23 | Plan 1 Tasks 2, 6; audit in every mutation |
| BR-24–32 | Plan 1 Tasks 2, 5; Plan 2 Tasks 3–5 |
| BR-33–40 | Plan 1 Task 4; Plan 2 Tasks 2, 3 |
| BR-41–46 | Plan 1 Task 4; Plan 2 Task 1 |
| BR-47–52 | Plan 2 Task 1 |
| BR-53–55 | Plan 1 Task 4; Plan 2 Task 6 |
| BR-56–61 | Plan 2 Task 5 |
| BR-62–64 | Plan 2 Task 3 |
| BR-65–69 | Plan 2 Task 4 |
| BR-70–74 | Plan 2 Task 7 |

The frontend plan exposes each role's UR workflow and creates `docs/requirements-coverage.md` mapping every individual REQ/UR/BR to UI, API, SQL and a check.

## Tasks

### Task 1: Runtime, database, and reproducible seed

**Files:** Create `package.json`, `compose.yaml`, `.env.example`, `server/app.js`, `server/db.js`, `server/errors.js`, `server/audit.js`, `db/migrate.js`, `db/migrations/001_core.sql`, `db/seed.js`, `test/smoke.test.js`; modify `README.md`, `.gitignore`.

**Interfaces:** `createApp() -> Express`; `pool: mysql2.Pool`; `withTransaction(work: (connection) => Promise<T>) -> Promise<T>`; `recordAudit(connection, {actorId, action, entity, entityId, before, after, reason}) -> Promise<void>`.

- [ ] Write `test/smoke.test.js` with `test('health and seed inventory')`: `assert.equal(health.status, 200)`, `assert.deepEqual(counts, [300, 150, 250, 100])`, and a second migration leaves counts unchanged.
- [ ] Run `node --test test/smoke.test.js` against MySQL 8.4; expect failure because app/schema do not exist.
- [ ] Add Express app, MySQL pool and transaction helper, migration ledger, seed script and local Compose service; do not auto-seed outside an explicit command.
- [ ] Run migration, seed and `node --test test/smoke.test.js`; expect pass, then run `git diff --check`.
- [ ] Commit `feat: bootstrap TKC API and MySQL schema`.

### Task 2: Accounts, sessions, and server-side roles

**Files:** Create `server/auth.js`, `db/migrations/002_identity.sql`, `test/auth.test.js`; modify `server/app.js`, `db/seed.js`.

**Interfaces:** `requireUser(req,res,next)`; `requireRole(...roles) -> middleware`; `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`. Account and Customer remain separate records; Employee links to Department and Role.

- [ ] Write `test('identity and roles')`: `assert.notEqual(storedHash, password)`, `assert.equal(anonymous.status, 401)`, `assert.equal(wrongRole.status, 403)`, `assert.equal(expired.status, 401)`, and returned malicious text stays a JSON string.
- [ ] Run `node --test test/auth.test.js`; expect failure.
- [ ] Implement customer registration/login and seeded demo staff credentials through server sessions stored in MySQL; rotate session on login and hash passwords with Node `crypto.scrypt`.
- [ ] Run auth tests and smoke test; expect pass.
- [ ] Commit `feat: add customer and staff authentication`.

### Task 3: Inventory, closures, and date-based availability

**Files:** Create `server/rooms.js`, `test/rooms.test.js`; modify `server/app.js`, `db/migrations/001_core.sql` only if not yet deployed, otherwise add a new migration.

**Interfaces:** `getAvailability(connection, {checkIn, checkOut, guests}) -> Promise<RoomTypeAvailability[]>`; `GET /api/rooms/types`; `GET /api/rooms/availability?checkIn&checkOut&guests`; `GET /api/rooms/:id/history`; Superadmin `POST /api/rooms/types`, `PATCH /api/rooms/types/:id`, `POST /api/rooms`, `PATCH /api/rooms/:id`; staff closure endpoints scoped by role.

- [ ] Write `test('date range availability')`: `assert.equal(totalRooms, 800)`, `assert.equal(adjacentOverlap, false)`, `assert.equal(futureAvailable, true)`, `assert.equal(closedOnIntersectingDate, false)`, non-Superadmin room edits return 403, and invalid dates reject.
- [ ] Run `node --test test/rooms.test.js`; expect failure.
- [ ] Implement SQL availability using bookings/active holds/repair closures rather than a permanent `booked` room flag; use parameterized queries.
- [ ] Run room and smoke tests; expect pass.
- [ ] Commit `feat: search room inventory by stay dates`.

### Task 4: Pricing and promotion snapshots

**Files:** Create `server/pricing.js`, `db/migrations/003_pricing.sql`, `test/pricing.test.js`; modify `server/app.js`.

**Interfaces:** `priceServices({rooms, breakfastDates, fitness, sauna}) -> number`; `quoteBooking({rooms, checkIn, checkOut, breakfastDates, fitness, sauna, tourCharges = [], promotions}) -> Quote` with `roomSubtotal`, `discounts[]`, `serviceSubtotal`, `total`, `depositDue`; `POST /api/bookings/quote`. Plan 2 computes dated tour charges before calling this function.

- [ ] Write `test('DOCX price examples')`: `assert.equal(single.total, 3200)`, `assert.equal(single.depositDue, 640)`, `assert.equal(multi.total, 12700)`, `assert.equal(multi.depositDue, 5080)`, `assert.equal(stacked.total, 4100)`.
- [ ] Run `node --test test/pricing.test.js`; expect failure.
- [ ] Implement price math in integer baht; room-only sequential promotions ordered by management priority; breakfast per room/date; fitness and sauna once per room; pool free; reject invalid room count or guest capacity.
- [ ] Run pricing tests; expect pass.
- [ ] Commit `feat: calculate booking prices and deposits`.

### Task 5: Multiroom booking and temporary holds

**Files:** Create `server/bookings.js`, `db/migrations/004_bookings.sql`, `test/bookings.test.js`; modify `server/app.js`, `server/rooms.js`, `server/audit.js`.

**Interfaces:** `createBookingHold(connection, {customerId, rooms, checkIn, checkOut, services, tours, now}) -> Promise<Booking>`; `expireBookingHolds(connection, now) -> Promise<number>`; `POST /api/bookings`; `GET /api/bookings/mine`; `GET /api/bookings/:id`.

- [ ] Write `test('atomic multiroom hold')`: `assert.equal(booking.rooms.length, 2)`, `assert.equal(concurrentSuccesses, 1)`, `assert.equal(availableAfterExpiry, 1)`, `assert.equal(itemsAfterRollback, 0)`, `assert.equal(otherCustomer.status, 403)`.
- [ ] Run `node --test test/bookings.test.js`; expect failure.
- [ ] Implement transaction-level inventory locking and hold expiry; persist quote/promotion snapshot with booking; record every status transition in audit/history.
- [ ] Run booking, availability and pricing tests; expect pass.
- [ ] Commit `feat: hold multiroom bookings without overselling`.

### Task 6: Staff management and audit visibility

**Files:** Create `server/staff.js`, `test/staff.test.js`; modify `server/app.js`, `server/audit.js`, `db/migrations/002_identity.sql` only if not yet deployed.

**Interfaces:** `GET /api/staff`, `POST /api/staff`, `PATCH /api/staff/:id`; `GET /api/audit`; `GET /api/audit/financial`; `recordAudit(...)` from Task 1.

- [ ] Write `test('role administration audit')`: `assert.equal(superadminEditManagement.status, 403)`, `assert.equal(managementEditSuperadmin.status, 200)`, `assert.equal(audit.actorId, actor.id)`, and before/after values match the mutation.
- [ ] Run `node --test test/staff.test.js`; expect failure.
- [ ] Implement role administration and read-only audit endpoints using the same role middleware; never log passwords or session secrets.
- [ ] Run staff tests and complete `npm test`; expect pass.
- [ ] Commit `feat: manage staff rights and inspect audit history`.

## Handoff

Next: `2026-11-14-payments-operations.md`, then `2026-11-14-premium-frontend.md`. Each plan has its own testable deliverable; no hosting choice is made here.
