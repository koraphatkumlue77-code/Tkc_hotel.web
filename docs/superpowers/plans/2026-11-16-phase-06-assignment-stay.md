# Phase 6: Assignment and Stay Implementation Plan

**Goal:** Deliver the transactional physical-room and stay lifecycle against `tkc_hotel_test` and the local application.

**Architecture:** Add a `stays` module with route, service/validation, and explicit `mysql2` repository layers. Mount it after authentication. Reuse the existing session role middleware, money helpers, error envelope, and audit writer.

**Tech Stack:** Express 5, `mysql2/promise`, Node test runner, MySQL 26.7-compatible SQL.

---

### Task 1: Define failing stay contracts

- [x] Add unit tests for assignment, emergency move, and optional reason validation.
- [x] Add real-MySQL route tests for authentication, roles, assignment safety, Check-in, No-show, emergency decisions, balance enforcement, and Check-out cleaning.
- [x] Run the focused tests and capture the expected red result.

### Task 2: Implement stay API contracts and routing

- [x] Add `api/modules/stays/contracts.js` and `service.js`.
- [x] Add authenticated role-correct routes in `api/modules/stays/routes.js`.
- [x] Mount the stays module in `api/app.js`.
- [x] Prove validation and access-control tests.

### Task 3: Implement transactional assignment and arrival

- [x] Add `repository.js` assignment/reassignment logic with row locks and overlap/type/state checks.
- [x] Implement Check-in and No-show transitions with room status updates and audit history.
- [x] Prove assignment, overlap, Check-in, and No-show integration tests.

### Task 4: Implement emergency moves

- [x] Persist an inert request with audit evidence.
- [x] Add one-time management approve/reject decisions.
- [x] On approval, move occupancy and queue old-room cleaning transactionally.
- [x] Prove approval, room-state/cleaning effects, and repeated-decision conflicts.

### Task 5: Implement Check-out and proof

- [x] Enforce calculated net paid balance.
- [x] End assignments, queue cleaning, update room/booking states, and audit atomically.
- [x] Run focused tests, the full unit/static suite, the full MySQL integration suite, syntax checks, and diff checks.
- [x] Write Phase 6 evidence and update the master phase status.
