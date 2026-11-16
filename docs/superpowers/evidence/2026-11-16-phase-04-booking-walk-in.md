# Phase 4 Booking and Walk-in Evidence

Date: 2026-11-16

## Delivered

- Transactional `POST /api/bookings` with a 15-minute payment hold.
- Server-side room, breakfast, promotion, deposit, and total snapshots.
- Room-type and physical-inventory locking with active booking and effective
  `RoomEvent` closure checks.
- Priority-ordered promotion stacking with immutable `BookingPromotion` rows.
- Owner-scoped customer history/detail, cancellation, and late-arrival actions.
- Atomic same-day walk-in customer/booking creation and optional physical room
  assignment for reception.
- Role-scoped staff booking list/detail APIs.
- Browser booking creation/history/cancellation backed by the API and MySQL.
- Checked integer money arithmetic bounded to MySQL `DECIMAL(12,2)`.

## Automated proof

Clean dependency install and dependency review:

```text
npm ci
added 91 packages
npm audit --omit=dev
found 0 vulnerabilities
```

Unit and static frontend checks:

```text
npm test
48 tests, 48 passed, 0 failed
```

Serial real-MySQL integration checks:

```text
npm run test:db
20 tests, 20 passed, 0 failed
```

The booking integration suite proves successful snapshots, capacity validation,
overlap and expired-hold behavior, concurrent final-room requests, effective room
closures, promotion ordering, owner isolation, cancellation restoration,
late-arrival transitions, walk-in role/assignment behavior, rollback of failed
walk-in customer creation, concurrent identity reuse, and monetary overflow rejection.

Smoke checks:

```text
GET /api/health     -> 200 {"status":"ok","service":"tkc-hotel-api"}
GET /api/health/db  -> 200 {"status":"ok","database":"connected"}
GET /               -> 200
git diff --check    -> clean
```

## Visible browser proof

The local website completed registration with a synthetic development fixture,
availability search, Standard Room booking creation, and history reload. The
reloaded history displayed the persisted booking code, `PENDING_PAYMENT` state,
correct 2037-06-10 through 2037-06-12 dates, two guests, the hold expiry, and the
server total of THB 2,000. The fixture uses
`codex.phase4.20261116@example.test`; no password is recorded here.

## Review

Independent review initially identified five Important issues: effective closure
omission at create time, non-atomic walk-in customer creation, assignment of
non-available physical rooms, cancellation on/after arrival day, and oversized
money arithmetic. Regression tests were added first, all five responsible layers
were corrected, and the full proof above passed after the fixes.
The re-review then found one scheduled-reopening boundary issue; creation now
matches the availability API by applying a reopening only when its effective time
is on or before check-in, with a future-reopening regression test.
