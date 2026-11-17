# Phase 7: Services, Promotions, Tours, and Refunds Implementation Plan

**Goal:** Deliver persistent add-ons, catalog administration, capacity-safe tours, and immutable refunds.

**Architecture:** Add focused `services`, `promotions`, `tours`, and `refunds` Express modules. Each owns contracts, service orchestration, explicit SQL, transaction locks, and audits while sharing existing auth, money, validation, and error helpers.

---

### Task 1: Catalog and booking services

- [x] Write failing unit and MySQL tests for public catalog, customer add/cancel, ownership/state/date rules, and pricing snapshots.
- [x] Implement charge-unit calculation and transactional booking snapshot updates.
- [x] Implement post-Check-in Reception service plus accepted `SERVICE_PAYMENT` atomically and idempotently.

### Task 2: Promotions and attractions

- [x] Write failing role, validation, create/update, unique-code, and immutable-snapshot tests.
- [x] Implement promotion list/create/update APIs.
- [x] Implement visible attraction list and staff create/update APIs.

### Task 3: Tour rounds and participants

- [x] Write failing round list/admin and participant add/cancel tests.
- [x] Implement eligible-seat counting, round locks, stay-date checks, and daily participant sequence pricing.
- [x] Prove concurrent final-seat requests produce one winner and cancelled uses do not affect sequence.

### Task 4: Refund lifecycle

- [x] Write failing tests for request bounds, role isolation, queue, first management decision, payout, and immutable source payment.
- [x] Implement locked request/decision/payout transactions with audits and idempotency.
- [x] Prove concurrent duplicate payout cannot create two outgoing rows.

### Task 5: Frontend slice and verification

- [x] Connect facility/tour dialogs and staff promotion/refund states to the APIs, preserving the existing design.
- [x] Add loading/empty/error/success refresh behavior and static API-wiring tests.
- [x] Run focused tests, full unit/static and real-MySQL suites, syntax/diff/audit checks, and local browser proof.
- [x] Document endpoints and write Phase 7 evidence.
