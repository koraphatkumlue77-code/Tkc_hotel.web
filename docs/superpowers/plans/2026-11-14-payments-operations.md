# TKC Payments and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำบริการ การชำระแบบจำลอง การเข้าพัก งานพนักงาน และการคืนเงินให้ครบตาม DOCX บนข้อมูลจองจริง

**Architecture:** โมดูล Node.js ใช้ pool และ `withTransaction()` จากแผนแรก ทุกการเปลี่ยนสถานะบันทึก audit พร้อมข้อมูลก่อน/หลังใน transaction เดียวกัน ฝั่งการเงินเป็นข้อมูลจำลองแต่ส่งผลต่อสถานะการจองจริงในระบบ

**Tech Stack:** Node.js 24, Express 5, mysql2, multer for bounded image uploads, MySQL 8.4, Node built-in test runner; ขึ้นต่อจาก `2026-11-14-platform-booking.md`

**Spec:** `docs/superpowers/specs/2026-11-14-tkc-hotel-web-system-design.md` และ `docs/reference/TKC_Requirements_Business_Rules_TH.docx`

## Global Constraints

- ไม่มีการตัดหรือคืนเงินจริง; ทุกธุรกรรมต้องมีป้ายว่าเป็นการจำลอง
- ให้บัญชีรับรองก่อนยืนยันจอง; มัดจำที่ครบก็ยืนยันได้ แต่ Check-in ต้องชำระครบ
- การจองหลายห้องใช้ชุดบริการต่อห้องเหมือนกัน; ทัวร์ระบุผู้ร่วมแยก
- เมื่อโรงแรมให้ห้องใดห้องหนึ่งไม่ได้ ต้องเสนอห้องแทนก่อน; หากไม่ได้หรือไม่รับ ยกเลิกทั้งใบจองและคืนยอดที่ชำระทั้งหมดหลังฝ่ายบริหารอนุมัติ
- สิทธิ์ทุก mutation ตรวจใน server; management ดูประวัติทุกฝ่าย

## Review Focus

1. หลักฐานถูกบัญชีปฏิเสธหลัง 30 นาที: กันห้องต่อระหว่างตรวจ แล้วเปิด 15 นาทีให้ส่งใหม่เมื่อปฏิเสธ — Task 2
2. สองใบจองขอที่นั่งเที่ยวสุดท้ายพร้อมกัน: ยืนยันหรือกันได้เพียงหนึ่ง — Task 1
3. ปิดซ่อมห้องที่มีการจองอนาคต: ต้องเสนอห้องแทนหรือยกเลิก/คืนทั้งใบจอง — Task 4
4. โปรโมชั่นเปลี่ยนหลังจองยืนยัน: ราคาย้อนหลังไม่เปลี่ยน — Task 6
5. เช็กอินก่อน 14:00 หรือยังจ่ายไม่ครบ: ต้องปฏิเสธแม้ห้องพร้อม — Task 3

## File Map

- `server/services.js`, `server/tours.js`: บริการก่อน/หลังเข้าพัก รอบเที่ยว ผู้ร่วม และความจุ
- `server/payments.js`, `server/refunds.js`: ผลตรวจจำลอง บัญชี ยอดค้าง คำขอ/อนุมัติ/คืนจำลอง
- `server/stays.js`, `server/housekeeping.js`: จัดห้อง Walk-in เข้า/ออก งานแม่บ้าน ความเสียหายและซ่อม
- `server/content.js`, `server/chat.js`, `server/reports.js`: รีวิว สถานที่ แชต รายงานและโปรโมชั่น
- `db/migrations/005_*.sql` ถึง `008_*.sql`, `test/*.test.js`: ตารางและการตรวจรับโดเมน

## Tasks

### Task 1: Shared services and capacity-limited tours

**Files:** Create `server/services.js`, `server/tours.js`, `db/migrations/005_services_tours.sql`, `test/services-tours.test.js`; modify `server/bookings.js`, `server/pricing.js`, `server/app.js`.

**Interfaces:** Reuse `priceServices(...)` and `quoteBooking(...)` from Plan 1; `priceTourParticipants(connection, {date, participants}) -> Promise<number[]>`; `reserveTourSeats(connection, {bookingId, slotId, participants, now}) -> Promise<Reservation>`; `GET /api/tours/slots?date`; `POST /api/bookings/:id/services`; `POST /api/tours/reservations`. Seed tour rounds from 15:00.

- [ ] Write `test('shared services and tour capacity')`: `assert.equal(standardBreakfast, 350)`, `assert.equal(familyBreakfast, 500)`, `assert.equal(firstTour.time, '15:00')`, `assert.deepEqual(sameDayTourPrices, [50,20])`, `assert.equal(lastSeatSuccesses, 1)`, `assert.equal(seatsAfterCancel, 1)`, `assert.equal(tourRefund, 0)`.
- [ ] Run `node --test test/services-tours.test.js`; expect failure.
- [ ] Implement service records and dated tour slots/participants using transactions; selected tour seats share booking hold/review expiry rules; after Check-in, reception confirms an added service only after recording full simulated payment.
- [ ] Run services/tours and booking/pricing tests; expect pass.
- [ ] Commit `feat: add shared services and tour capacity`.

### Task 2: Simulated payment and accounting review

**Files:** Create `server/payments.js`, `server/uploads.js`, `db/migrations/006_payments.sql`, `test/payments.test.js`; modify `server/app.js`, `server/bookings.js`.

**Interfaces:** `submitPaymentAttempt(connection, {bookingId, amount, method, evidence, now}) -> Promise<Payment>`; `reviewPayment(connection, {paymentId, accountantId, decision, reason, now}) -> Promise<Payment>`; `POST /api/bookings/:id/payments`; `POST /api/payments/:id/review`; `GET /api/payments/pending`; `POST /api/payments/:id/escalations` by the member after 30 minutes; `GET /api/payments/escalations` for Superadmin.

- [ ] Write `test('simulated payment lifecycle')`: `assert.equal(oneRoomDepositRate, .2)`, `assert.equal(multiRoomDepositRate, .4)`, `assert.equal(statusBeforeAccounting, 'pending_review')`, `assert.equal(heldAfterThirtyMinutes, true)`, escalation after 30 minutes reaches Superadmin, `assert.equal(retryUntil - rejectedAt, fifteenMinutes)`, and invalid evidence/amount reject.
- [ ] Run `node --test test/payments.test.js`; expect failure.
- [ ] Implement explicit simulated channels, upload storage metadata, automatic rule check, accounting approval/rejection and pending-review age; customer status explains that no money moves.
- [ ] Run payment, booking and availability tests; expect pass.
- [ ] Commit `feat: review simulated booking payments`.

### Task 3: Assignment, Walk-in, arrival, and departure

**Files:** Create `server/stays.js`, `db/migrations/007_stays.sql`, `test/stays.test.js`; modify `server/app.js`, `server/rooms.js`, `server/bookings.js`.

**Interfaces:** `assignRoom(connection, {bookingRoomId, roomId, actorId, now}) -> Promise<void>`; `checkIn(connection, {bookingId, actorId, now}) -> Promise<void>`; `checkOut(connection, {bookingId, actorId, now}) -> Promise<void>`; `POST /api/walk-ins`; `POST /api/bookings/:id/assignments`; `POST /api/bookings/:id/check-in`; `POST /api/bookings/:id/check-out`; late-arrival and no-show endpoints.

- [ ] Write `test('arrival and departure guards')`: `assert.equal(assignBeforeApproval.status, 409)`, `assert.equal(checkInAt1359.status, 409)`, `assert.equal(checkInWithBalance.status, 409)`, `assert.equal(cleaningTasksAfterCheckout, 1)`, `assert.equal(unannouncedAt0601.status, 'no_show')`; assert Walk-in can lack a member account.
- [ ] Run `node --test test/stays.test.js`; expect failure.
- [ ] Implement room assignment history, late-arrival contact outcome and status transitions; record actor/time for every operation.
- [ ] Run stays, payments and rooms tests; expect pass.
- [ ] Commit `feat: manage room assignment and stays`.

### Task 4: Housekeeping, damage, repair, and emergency moves

**Files:** Create `server/housekeeping.js`, `db/migrations/008_housekeeping.sql`, `test/housekeeping.test.js`; modify `server/app.js`, `server/stays.js`, `server/rooms.js`.

**Interfaces:** `startCleaning(connection, {taskId, employeeId, now})`; `finishCleaning(connection, {taskId, employeeId, now})`; `closeRoomForRepair(connection, {roomId, managerId, from, to, reason})`; `proposeReplacement(connection, {bookingId, roomId, actorId, now})`; `POST /api/housekeeping/tasks/:id/start`; `POST /api/housekeeping/tasks/:id/finish`; `POST /api/bookings/:id/replacements`; damage, repair and approved-move endpoints.

- [ ] Write `test('cleaning and repair transitions')`: `assert.equal(cleaningTasks, 1)`, `assert.equal(cleanedBy, housekeeper.id)`, `assert.equal(stateAfterDamage, 'dirty')`, cleaning alone does not reopen a repair-closed room, `assert.equal(nonManagerClose.status, 403)`, `assert.equal(moveWithoutApproval.status, 409)`.
- [ ] Run `node --test test/housekeeping.test.js`; expect failure.
- [ ] Implement queue, damage evidence, repair intervals and move approval; flag affected bookings and allow a compatible replacement room proposal under BR-32.
- [ ] Run housekeeping, stays and room tests; expect pass.
- [ ] Commit `feat: manage cleaning damage and repairs`.

### Task 5: Cancellations and simulated refunds

**Files:** Create `server/refunds.js`, `db/migrations/009_refunds.sql`, `test/refunds.test.js`; modify `server/app.js`, `server/bookings.js`, `server/payments.js`.

**Interfaces:** `quoteRefund(connection, {bookingId, reason, now}) -> Promise<RefundQuote>`; `requestRefund(connection, {bookingId, requesterId, reason, now}) -> Promise<RefundRequest>`; `decideRefund(connection, {requestId, managerId, approved, now})`; `recordRefund(connection, {requestId, accountantId, now})`; `POST /api/bookings/:id/replacement-decision` accepts/declines a proposed alternative.

- [ ] Write `test('DOCX refund cases')`: `assert.deepEqual(refundsForPaidAmounts, [0,1000,4000])`, `assert.equal(afterCutoff, 0)`, `assert.equal(serviceRefund, paidServiceCharge * .8)`, `assert.equal(tourOnlyRefund, 0)`, `assert.equal(hotelFailureRefund, amountPaid)`, `assert.equal(refundBeforeApproval.status, 409)`.
- [ ] Run `node --test test/refunds.test.js`; expect failure.
- [ ] Implement snapshots and separate request, decision, transaction records; retain historical payment totals and prices; cancellation returns inventory/seats where applicable.
- [ ] Run refunds, services, payment and booking tests; expect pass.
- [ ] Commit `feat: process simulated cancellations and refunds`.

### Task 6: Promotions, management reports, and financial history

**Files:** Create `server/reports.js`, `test/reports-promotions.test.js`; modify `server/pricing.js`, `server/app.js`, `server/audit.js`.

**Interfaces:** `GET /api/reports/overview`; `GET /api/reports/financial`; `GET /api/promotions`; `POST /api/promotions`; `PATCH /api/promotions/:id`; `GET /api/audit/financial`.

- [ ] Write `test('promotion and report history')`: `assert.equal(nonManagerPromotion.status, 403)`, `assert.equal(confirmedBooking.total, originalTotal)` after promotion edit, `assert.equal(report.received, approvedPaymentSum)`, and audit exposes before/after finance values.
- [ ] Run `node --test test/reports-promotions.test.js`; expect failure.
- [ ] Implement booking-level date/min-night/min-room promotion rules and reports from MySQL aggregates; avoid hardcoded dashboard totals.
- [ ] Run reports tests and `npm test`; expect pass.
- [ ] Commit `feat: expose management and finance reports`.

### Task 7: Reviews, attractions, and member chat

**Files:** Create `server/content.js`, `server/chat.js`, `db/migrations/010_content_chat.sql`, `test/content-chat.test.js`; modify `server/app.js`.

**Interfaces:** `POST /api/reviews`; `POST /api/reviews/:id/hide`; `GET /api/attractions`; `POST /api/attractions`; `PATCH /api/attractions/:id`; `GET /api/chats/:threadId/messages`; `POST /api/chats/:threadId/messages`.

- [ ] Write `test('content permissions')`: `assert.equal(unarrivedReview.status, 403)`, `assert.equal(checkedInBookerReviews.length, 2)`, `assert.equal(hiddenReview.publicVisible, false)`, `assert.equal(hiddenReview.originalText, original)`, `assert.equal(otherMemberChat.status, 403)`.
- [ ] Run `node --test test/content-chat.test.js`; expect failure.
- [ ] Implement review moderation, seasonal attractions and persisted chat with simple polling API; escape text in client rendering rather than treating message text as HTML.
- [ ] Run content/chat tests and full `npm test`; expect pass.
- [ ] Commit `feat: add reviews attractions and chat`.

## Handoff

Next: `2026-11-14-premium-frontend.md` connects every API to customer and staff pages and verifies each DOCX requirement end to end.
