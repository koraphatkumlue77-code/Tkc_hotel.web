# Phase 7 Services, Promotions, Tours, and Refunds Evidence

Verified: 2026-11-16 (Asia/Bangkok)

## Delivered

- Public MySQL service and attraction catalogs.
- Owner-scoped pre-Check-in add-on creation/cancellation with immutable usage price snapshots.
- Atomic post-Check-in Reception service and accepted `SERVICE_PAYMENT`, with idempotent replay.
- Management/Superadmin promotion and attraction create/update APIs and audit records.
- Public tour-round availability and staff round administration.
- Capacity-locked participant booking, daily participant use pricing, cancellation, and booking-total updates.
- Accounting refund requests bounded by accepted source money, Management first decision, and Accounting payout.
- Immutable incoming payments and one-only concurrent outgoing refund payouts.
- API-backed customer facility/tour dialog and staff promotion/refund lists/actions.

## Automated proof

```text
npm test
  64 passed, 0 failed

npm run test:db
  43 passed, 0 failed

npm audit --omit=dev
  found 0 vulnerabilities
```

The MySQL suite includes service ownership and idempotency, promotion/attraction roles,
tour price sequences, a concurrent final-seat race, refund bounds and final decisions,
an immutable source-payment assertion, and a concurrent duplicate-payout race.

`node --check script.js` and `git diff --check` passed. The live browser at
`http://localhost:3000` rendered the MySQL room catalog and the facility action opened the
real customer login gate; the legacy demo success/cancel messages are absent.
