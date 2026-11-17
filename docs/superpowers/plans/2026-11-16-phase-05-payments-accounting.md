# Phase 5 Payments and Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist private payment proofs, accounting decisions, verified receipts, and financial summaries for existing bookings.

**Architecture:** A payment module owns multipart validation, private file references, Payment transactions, state transitions, and authorization. Files live outside the static root; MySQL remains authoritative for ownership and state. Every money/state mutation is idempotent or row-locked and audited.

**Tech Stack:** Express 5, mysql2/promise, multer, node:fs/promises, node:test, MySQL

**Spec:** `docs/superpowers/specs/2026-11-16-phase-05-payments-accounting-design.md`

## Global Constraints

- Proofs are JPEG, PNG, or WebP and at most 5 MiB.
- Proof files live below `api/storage/payments/` and are never public static assets.
- Customer amount/type are derived from booking snapshots; browser values are ignored.
- Payment creation requires a 1–100 character idempotency key.
- Normalize idempotency keys to uppercase and scope replay to booking, operation,
  amount, and method; changed-input reuse returns 409.
- Database failure triggers best-effort cleanup of the newly uploaded file.
- Refund workflows are excluded.

## Review Focus

- Idempotency replay must return the original payment without creating another file reference or row.
- Initial proof and resubmission must share booking inventory lock order at hold expiry.
- A rejected proof may be replaced only before the 30-minute rejection hold expires.
- Concurrent approve/reject requests must produce one valid final decision.
- Proof download must not allow another customer or an unrelated staff role.
- Cancel/submission races must never resurrect a canceled booking.
- Financial totals must exclude submitted, rejected, canceled, and outgoing rows.

---

### Task 1: Private Upload Foundation

**Files:**
- Modify: `api/package.json`
- Modify: `api/config.js`
- Modify: `.gitignore`
- Create: `api/modules/payments/upload.js`
- Test: `api/test/payments.test.js`

**Interfaces:**
- Produces: `createProofUpload({ storageRoot })`, `removeUploadedProof(file)`, and normalized relative proof references.

- [ ] Add `multer` and a configurable `storageRoot` defaulting to `api/storage`.
- [ ] Write failing tests for MIME allow-list, magic-byte agreement, 5 MiB limit, generated names, and path confinement.
- [ ] Implement private disk storage, `no-store` delivery metadata, and safe best-effort cleanup.
- [ ] Run `node --test api/test/payments.test.js` and record a passing result.

### Task 2: Initial Customer Proof and Idempotency

**Files:**
- Create: `api/modules/payments/contracts.js`
- Create: `api/modules/payments/repository.js`
- Create: `api/modules/payments/service.js`
- Create: `api/modules/payments/routes.js`
- Modify: `api/app.js`
- Test: `api/integration/payments.test.js`

**Interfaces:**
- Produces: `POST /api/bookings/:bookingId/payment-proof` multipart fields `proof` and `idempotencyKey`.

- [ ] Write a real-MySQL failing test for owner submission, server-derived amount/type, `PAYMENT_REVIEW`, audit, and same-key replay with discarded-upload cleanup.
- [ ] Implement strict identifiers/idempotency validation, inventory-before-booking lock order, DB-time hold recheck, and locked payment creation.
- [ ] Change customer cancellation to reject `PAYMENT_REVIEW`; prove cancellation/submission and final-room-at-expiry races.
- [ ] Confirm zero-total bookings without Payment and enforce a 0.01 minimum due for positive totals.
- [ ] Remove a just-uploaded file when validation or transaction work fails.
- [ ] Prove wrong owner, expired hold, wrong state, invalid file, and repeated idempotency behavior.

### Task 3: Rejection Hold and Resubmission

**Files:**
- Modify: `api/modules/payments/repository.js`
- Modify: `api/modules/payments/routes.js`
- Test: `api/integration/payments.test.js`

**Interfaces:**
- Produces: `POST /api/bookings/:bookingId/payment-proof/resubmit` and a linked immutable replacement Payment row.

- [ ] Write failing tests for rejected proof replacement within 30 minutes and expiry after the window.
- [ ] Implement latest-rejection locking, link preservation, and `PAYMENT_REVIEW` restoration.
- [ ] Prove same-key replay, changed-input key conflict, concurrent uniqueness, wrong owner, missing rejection, and expired rejection hold.

### Task 4: Accounting Queue and Protected Proof

**Files:**
- Modify: `api/modules/payments/repository.js`
- Modify: `api/modules/payments/routes.js`
- Test: `api/integration/payments.test.js`

**Interfaces:**
- Produces: `GET /api/accounting/payments`, `GET /api/accounting/payments/:paymentId`, and `GET /api/payments/:paymentId/proof`.

- [ ] Write failing queue/detail tests for bounded pagination, status filtering, and safe customer/booking fields.
- [ ] Implement accounting/superadmin/management reads and proof authorization/path confinement with `no-store`.
- [ ] Prove owner access, unrelated-customer 404, housekeeping denial, accounting access, and missing-file handling.

### Task 5: Accounting Approval and Rejection

**Files:**
- Modify: `api/modules/payments/contracts.js`
- Modify: `api/modules/payments/repository.js`
- Modify: `api/modules/payments/routes.js`
- Test: `api/integration/payments.test.js`

**Interfaces:**
- Produces: `POST /api/accounting/payments/:paymentId/approve` and `/reject`.

- [ ] Write failing tests for approve → `VERIFIED`/`CONFIRMED` and reject → `REJECTED`/30-minute hold.
- [ ] Implement accounting-only Payment+Booking row locks, audit, and idempotent same-decision replay that preserves the first reviewer/reason/deadline.
- [ ] Prove concurrent opposite decisions and cancellation races yield one valid winner without split state.

### Task 6: Verified Receipts and Financial Summary

**Files:**
- Modify: `api/modules/payments/repository.js`
- Modify: `api/modules/payments/routes.js`
- Test: `api/integration/payments.test.js`

**Interfaces:**
- Produces: `POST /api/staff/bookings/:bookingId/payments` and `GET /api/accounting/financial-summary`.

- [ ] Write failing tests for partial `BALANCE`, first fully settled walk-in `FULL_PAYMENT`, eligible states, and idempotency replay.
- [ ] Implement positive staff-entered amounts bounded by server outstanding, method validation, audit, and Bangkok-date aggregation.
- [ ] Prove overpayment/state rejection and exclusion of submitted/rejected/canceled/outgoing values while accepting legacy approved/completed rows.

### Task 7: Customer and Accounting Frontend Slice

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Modify: `style.css` only if existing components cannot express upload/review states
- Test: `api/test/frontend-auth.test.js`

**Interfaces:**
- Consumes: Tasks 2–6 routes.
- Produces: persistent customer proof upload/status and API-backed accounting review UI.

- [ ] Replace hidden/demo slip and `demoBookings` accounting paths with `FormData` API calls.
- [ ] Render upload, resubmit, accounting queue/review, reception receipt, and accounting/management summary states.
- [ ] Refresh only the affected booking or queue after mutation.
- [ ] Prove static API wiring and a visible browser flow through approval and reload.

### Task 8: Documentation, Cleanup, and Verification

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/evidence/2026-11-16-phase-05-payments-accounting.md`
- Test: full unit/integration/browser/smoke suite

**Interfaces:**
- Produces: operator instructions and final Phase 5 evidence.

- [ ] Document upload limits, private storage, customer/accounting endpoints, and local test flow.
- [ ] Add orphan-proof cleanup coverage or a cleanup script if transactional tests expose leftovers.
- [ ] Run clean install, unit, serial MySQL, concurrent review, browser, audit, static exposure, and smoke checks.
- [ ] Request focused independent review and resolve all Critical/Important findings.
