# Phase 5 Payments and Accounting Evidence

Verified: 2026-11-16 (Asia/Bangkok)

## Delivered

- Private JPEG/PNG/WebP proof storage with 5 MiB limit, MIME and magic-byte checks,
  generated references, authenticated delivery, and `no-store` responses.
- Customer initial proof and linked rejected-proof resubmission with inventory/hold locking,
  server-derived money, immutable history, file cleanup, and idempotent replay.
- Bounded accounting queue/detail reads and owner/accounting protected proof access.
- Accounting-only approve/reject transitions with Payment+Booking row locks, audit records,
  preserved first decisions, 30-minute retry holds, and concurrent-decision coverage.
- Reception verified receipts bounded by server outstanding totals, including partial balances
  and first fully settled walk-in classification.
- Bangkok-date financial summaries for canonical and legacy accepted incoming statuses.
- API-backed customer, accounting, reception, and management frontend states.
- README operator instructions for storage, limits, endpoints, and the local test flow.

## Automated proof

From `api/`:

```text
npm ci
  added 99 packages; audited 100 packages

npm audit --omit=dev
  found 0 vulnerabilities

npm test
  52 passed, 0 failed

npm run test:db
  30 passed, 0 failed
```

The MySQL suite includes initial upload, replay/file count, ownership, expiry and final-room
race, rejection/resubmission, protected proof access, role isolation, missing files,
approve/reject replay, opposite-decision and cancellation races, verified receipts,
overpayment/state rejection, and Bangkok financial aggregation.

Additional verification:

```text
node --check script.js
git diff --check
curl http://127.0.0.1:3000/api/health
  {"status":"ok","service":"tkc-hotel-api"}
curl http://127.0.0.1:3000/api/health/db
  {"status":"ok","database":"connected"}
GET /api/storage/payments/example.png
  404
```

## Browser proof

The restarted local server at `http://127.0.0.1:3000` loaded the real room catalog and an
authenticated customer's persisted bookings. A new future booking was created through the
visible page; reopening “รายการจองของฉัน” showed its MySQL-backed totals, active hold, and
the new PNG/JPEG/WebP proof form. Static frontend tests prove wiring for upload/resubmit,
accounting queue/detail/approve/reject, reception receipts, and accounting/management summary.

## Storage cleanup ruling

No separate cleanup script was added. Every failed upload mutation and idempotent replay calls
the idempotent file-removal helper; integration tests assert directory file counts after wrong
owner, expired hold, invalid state, replay, resubmission failure, and final-room expiry races.
This covers the transactional orphan cases exposed by the implemented workflow without adding
an unscoped file-deletion operator.
