# Facility and Tour Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fitness, sauna, sunset, and night-market reservations persist with selectable party sizes, server-enforced capacity, and free tour totals.

**Architecture:** Paid add-ons continue through `BookingService`/`ServiceUsage`, with a new round time and transactional capacity checks. Tours continue through `TourRound`/`TourReservation`; fixed schedules stored in `Service.schedule_json` are materialized idempotently for requested dates, and party booking is atomic.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Express 5, MySQL 8, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-17-facility-tour-booking-design.md`

## Global Constraints

- Fitness is 500 THB/person with capacity 40 per date/time round.
- Sauna is 300 THB/person and has no shared capacity limit in this scope.
- Sunset locations are `เกาะสวรรค์` and `ริมชายหาด`, each with 10 seats at 30-minute intervals from 15:30 through 18:30.
- Night market has 10 seats at 19:30, 20:00, and 20:30.
- Every tour is free and must not create a payment record.
- Party size cannot exceed the selected booked room's guest count.
- Preserve all existing customer profile work and unrelated dirty-worktree files.

## Review Focus

- Two customers requesting the final fitness/tour seats concurrently: one transaction wins and capacity never becomes negative.
- A pending booking whose hold has expired: add-on and tour requests fail without writing rows.
- Party size larger than the room's booked guest count: the API rejects it even if the browser is bypassed.
- Date/time outside the stay or locked schedule: the API rejects it without changing totals.
- A database failure during party insertion: the transaction rolls back every participant and no payment rows appear.

---

### Task 1: Database Contract and Catalog

**Files:**
- Create: `database/migrations/2026-11-17-facility-tour-booking.sql`
- Modify: `database/schema.sql`
- Modify: `database/seed.sql`
- Modify: `api/test/schema.test.js`
- Test: `api/integration/database.test.js`

**Interfaces:**
- Produces: nullable `ServiceUsage.start_time TIME`; fitness/sauna `PER_PERSON_PER_ROUND`; three `TOUR` services with fixed `schedule_json`, zero rates, and capacity 10.

- [ ] **Step 1: Write failing schema tests** asserting `ServiceUsage.start_time` exists and the canonical seed contains both sunset location services, zero tour rates, exact approved times, fitness capacity 40, and per-person charge units.

- [ ] **Step 2: Run the schema tests** with `cd api && node --test test/schema.test.js integration/database.test.js`; expect failures for the missing column/catalog rules.

- [ ] **Step 3: Add the idempotent migration** that adds `start_time`, updates fitness/sauna charge units and schedules, updates night-market rate/schedule, and inserts the two sunset `TOUR` services. Do not delete existing reservations.

- [ ] **Step 4: Update canonical schema and seed** with the same column and catalog values so reset databases match migrated databases.

- [ ] **Step 5: Run the focused schema tests** and expect PASS.

- [ ] **Step 6: Commit** with `feat: define facility and tour schedules`.

### Task 2: Paid Add-on Availability and Capacity

**Files:**
- Modify: `api/modules/services/contracts.js`
- Modify: `api/modules/services/repository.js`
- Modify: `api/modules/services/service.js`
- Modify: `api/modules/services/routes.js`
- Modify: `api/test/services.test.js`
- Modify: `api/integration/services.test.js`

**Interfaces:**
- Consumes: `ServiceUsage.start_time` and service `schedule_json` from Task 1.
- Produces: `GET /api/services/:serviceId/rounds?date=YYYY-MM-DD&bookingRoomId=N` returning `{startTime, capacity, reserved, remaining}`; customer service input `{serviceId, bookingRoomId, usageDate, startTime, quantity}`.

- [ ] **Step 1: Write failing contract tests** for normalized `startTime`, quantity 1–100, malformed times, and missing round time.

- [ ] **Step 2: Write failing integration tests** for a live pending hold, price multiplied by party size, room guest-count rejection, expired-hold rejection, exact fitness remaining capacity, invalid schedule time, and concurrent final-seat protection.

- [ ] **Step 3: Run focused tests** with `cd api && node --test --test-concurrency=1 test/services.test.js integration/services.test.js`; expect the new assertions to fail.

- [ ] **Step 4: Implement availability** in `ServicesRepository.listRounds(serviceId, bookingRoomId, date, customerId)` by validating ownership/stay date, parsing the catalog schedule, and summing active quantities belonging to live bookings.

- [ ] **Step 5: Implement transactional creation** by locking the owned booking, booked room, and service row; validate live status/hold, stay date, schedule time, room guest count, and fitness capacity before inserting `ServiceUsage.start_time` and updating totals.

- [ ] **Step 6: Expose the authenticated rounds route** and pass `startTime` through the service layer without changing staff post-check-in behavior.

- [ ] **Step 7: Run focused tests** and expect PASS.

- [ ] **Step 8: Commit** with `feat: enforce per-person facility capacity`.

### Task 3: Fixed Tour Rounds and Atomic Party Booking

**Files:**
- Modify: `api/modules/tours/contracts.js`
- Modify: `api/modules/tours/repository.js`
- Modify: `api/modules/tours/service.js`
- Modify: `api/modules/tours/routes.js`
- Modify: `api/modules/bookings/repository.js`
- Modify: `api/test/tours.test.js`
- Modify: `api/integration/tours.test.js`

**Interfaces:**
- Consumes: the three tour services and their `schedule_json` from Task 1.
- Produces: `POST /api/bookings/:bookingId/tours/party` consuming `{tourRoundId, bookingRoomId, quantity}` and returning `{bookingId, tourRoundId, quantity, reservations, amount: "0.00", status}`; booking detail gains a `tours` array with location, date, time, quantity, and status.

- [ ] **Step 1: Write failing contract tests** for `tourParty()` including round ID, booking-room ID, quantity 1–10, and invalid values.

- [ ] **Step 2: Write failing integration tests** proving exact sunset/night-market schedules materialize, locations remain distinct, all rates are zero, party insertion is atomic, room guest limit is enforced, remaining seats decrease, concurrent final-seat requests cannot overbook, booking detail returns the persisted party, and no `Payment` row is created.

- [ ] **Step 3: Run focused tests** with `cd api && node --test --test-concurrency=1 test/tours.test.js integration/tours.test.js`; expect failures for missing schedules and party route.

- [ ] **Step 4: Implement `ensureScheduledRounds(from, to)`** to read active `TOUR` schedule JSON and `INSERT IGNORE` the fixed rows for the requested date range before listing availability.

- [ ] **Step 5: Implement `addParty()`** in one transaction: lock owned live booking, booked room, and round; validate stay dates, quantity against room guest count and remaining seats; insert server-generated participant records; keep amount zero; write audit records; commit all-or-nothing.

- [ ] **Step 6: Add the party route and service method** while preserving the existing single-participant endpoint for compatibility.

- [ ] **Step 7: Extend customer booking detail** to return grouped tour parties without changing existing room/service/payment fields.

- [ ] **Step 8: Run focused tests** and expect PASS.

- [ ] **Step 9: Commit** with `feat: add free atomic tour party booking`.

### Task 4: Customer Facility Booking Interface

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `script.js`
- Modify: `api/test/frontend-auth.test.js`

**Interfaces:**
- Consumes: service-round availability from Task 2 and tour party booking from Task 3.
- Produces: location/date/time/quantity selection, plus/minus controls, review totals, and persisted success/error states.

- [ ] **Step 1: Write failing frontend tests** asserting location and quantity controls exist, services send `startTime` and selected quantity, tours use `/tours/party`, sunset is no longer informational-only, and free tours render `ฟรี`.

- [ ] **Step 2: Run the frontend test** with `cd api && node --test test/frontend-auth.test.js`; expect failure at the new controls/routes.

- [ ] **Step 3: Update the dialog markup** with a location field and accessible minus/plus stepper; keep a number input as the form source of truth.

- [ ] **Step 4: Update booking-option mapping** to retain each room's `guestCount`; allow live pending holds for paid add-ons and all existing tour-eligible states.

- [ ] **Step 5: Load and render availability** by selected booking/date/location, constrain quantity to `min(roomGuestCount, remaining)`, disable full rounds, and display per-person price and calculated total or `ฟรี`.

- [ ] **Step 6: Submit one request** with selected quantity/start time for services or one atomic party request for tours; surface server error codes in Thai and never mark a card booked before API success.

- [ ] **Step 7: Render persisted add-ons and tour parties** inside each customer booking card after reload, including location, round, quantity, paid add-on amount, and `ฟรี` for tours.

- [ ] **Step 8: Run `node --check ../script.js` and the frontend test**; expect PASS.

- [ ] **Step 9: Commit** with `feat: complete facility and tour booking UI`.

### Task 5: Migration, End-to-End Proof, and Regression

**Files:**
- Modify: `database/migration-record.md`
- Create: `docs/superpowers/evidence/2026-11-17-facility-tour-booking.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: migrated local development data and reproducible proof.

- [ ] **Step 1: Back up the development database** with `cd api && npm run db:backup`; record the verified backup path and checksum.

- [ ] **Step 2: Apply the idempotent migration** using an account with DDL privilege, then query exact columns, catalog rows, schedules, and zero tour rates.

- [ ] **Step 3: Run all automated tests** with `cd api && npm test && npm run test:db`; require 0 failures.

- [ ] **Step 4: Restart port 3000 and test in the browser** at mobile and desktop widths: select 2+ people, verify max/remaining behavior, book fitness, book each sunset location, book night market, reload booking detail, and confirm persisted records/totals.

- [ ] **Step 5: Inspect browser console and API responses** for errors; capture proof that tours are free and capacity decreased.

- [ ] **Step 6: Update migration/evidence records** with commands, counts, and observed results.

- [ ] **Step 7: Commit** with `test: verify facility and tour booking flow`.

