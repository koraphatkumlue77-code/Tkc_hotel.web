# Phase 5 Payments and Accounting Design

## Intent

Replace the remaining in-memory slip review demo with a local, auditable payment
workflow. Customers upload simulated transfer proof for an existing booking;
accounting reviews it; confirmed money and booking state persist in MySQL.

## Goals

- Accept initial and replacement payment proof for an owner-scoped booking.
- Derive the payable amount and transaction type from immutable booking snapshots.
- Store private image files outside the public web root and save only relative references.
- Give accounting a bounded queue, detail view, protected proof access, and locked
  approve/reject actions.
- Keep rejected inventory for 30 minutes and restore review state on resubmission.
- Record idempotent verified receipts and provide safe financial summaries.
- Replace the customer and accounting payment demos in the existing page.

## Non-goals

- No real bank or payment-gateway integration.
- No automatic image/OCR decision.
- No refund request or payout; those remain Phase 7.
- No cloud file storage.

## Constraints

- Express 5, MySQL, the existing cookie session and audit system.
- Use `multer` with a 5 MiB limit and allow JPEG, PNG, and WebP only.
- Store generated files below `api/storage/payments/`, ignored by Git and never
  exposed by static serving.
- All money comes from server snapshots and is serialized as decimal strings.
- All payment creation uses a 1–100 character idempotency key.
- Idempotency keys are normalized to uppercase. Replay is valid only for the same
  authorized booking, operation, amount, and method; mismatched reuse returns 409.
- A failed database mutation removes its newly uploaded file on a best-effort basis.
- Approval/rejection locks the Payment and Booking rows in one transaction.
- Authentication and authorization run before multipart middleware writes a file.
  Declared MIME and magic bytes must agree; proof responses use `Cache-Control: no-store`.

## Approaches

1. **Private filesystem plus MySQL references — selected.** Fits the local-only
   product, keeps blobs out of MySQL, and supports authenticated download routes.
2. Store image blobs in MySQL. Atomic, but makes backups and queries unnecessarily
   heavy for the existing schema.
3. Public static upload directory. Simple, but leaks proofs and conflicts with the
   existing static-runtime security contract.

## Data and state flow

An initial customer submission is allowed only while an owned booking is in an
unexpired `PENDING_PAYMENT` state. The API calculates the expected amount from
`total_snapshot` and `deposit_rate`, writes a `DEPOSIT` or `FULL_PAYMENT` row with
status `SUBMITTED`, changes the booking to `PAYMENT_REVIEW`, and audits both.
The transition acquires the same sorted RoomType and Room inventory locks used by
booking creation, then rechecks the hold with database time. A last-room booking
and a proof submitted at expiry therefore cannot both win.

Accounting approval changes the payment to `VERIFIED`. When verified incoming
payments meet the required initial amount, the booking becomes `CONFIRMED`.
Rejection changes the payment to `REJECTED`, returns the booking to
`PENDING_PAYMENT`, and sets `hold_expires_at` to 30 minutes from rejection.

A replacement proof is allowed only for the latest rejected payment before that
30-minute hold expires. It creates a new linked payment row, preserves the rejected
row, and returns the booking to `PAYMENT_REVIEW`.

The customer cannot cancel a `PAYMENT_REVIEW` booking. A cancellation racing a
submission has one winner: cancellation makes submission invalid, or submission
enters review and cancellation returns 409. Accounting never resurrects a canceled
booking.

A booking with server total `0.00` becomes `CONFIRMED` at creation without a
Payment row. A positive total whose percentage deposit rounds to zero has a minimum
initial payment of `0.01`.

Reception may record a positive cash/transfer receipt with an idempotency key for
`CONFIRMED`, `LATE_ARRIVAL`, or `CHECKED_IN` bookings. Partial receipts are allowed
but cannot exceed the server-calculated outstanding total. A first receipt that
fully settles a walk-in is `FULL_PAYMENT`; other receipts are `BALANCE`. These
receipts are created as `VERIFIED` because reception is recording money received,
not submitting proof for accounting review. Summary periods use Bangkok dates and
include canonical `VERIFIED` plus legacy accepted aliases `APPROVED` and
`COMPLETED`; submitted, rejected, canceled, and outgoing rows are excluded.

## Authorization

- Customer routes always require booking ownership.
- Proof content is available only to the booking owner or accounting, superadmin,
  and management employees.
- Queue reads allow accounting, superadmin, and management. Only accounting may
  approve or reject proof, preserving the accounting-only business rule.
- Reception receipt recording allows reception and superadmin.

## Failure behavior

- Invalid/missing file or idempotency key: 400.
- Wrong owner or hidden payment: 404.
- Wrong role: 403.
- Expired hold, wrong state, stale review, or duplicate semantic action: 409 unless
  the same idempotency key is replayed, which returns the original resource.
- Unsupported/oversized files are removed and never referenced by MySQL.

## Proof

Unit tests cover upload validation, safe references, and money derivation. Serial
real-MySQL tests cover success, owner/role isolation, idempotency replay,
approval/rejection, 30-minute resubmission, concurrent review, protected file
access, verified receipts, and financial summaries. A browser test covers customer
upload through accounting approval and persistence after reload.
