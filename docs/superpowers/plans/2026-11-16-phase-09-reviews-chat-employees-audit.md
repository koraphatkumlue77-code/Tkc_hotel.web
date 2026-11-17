# Phase 9: Reviews, Chat, Employees, and Audit Implementation Plan

**Goal:** Deliver the final business API slice and persistent customer/staff collaboration UI.

### Task 1: Reviews

- [x] Write failing contract/MySQL tests for public listing, checked-out ownership, one review per booking, and moderation.
- [x] Implement review routes/repository/audit.
- [x] Connect public/customer/staff review states.

### Task 2: Chat

- [x] Write failing tests for customer ownership, reception queue, unread marking, reply, and roles.
- [x] Implement polling-safe chat APIs.
- [x] Connect the existing chat panel and Reception view.

### Task 3: Employees

- [x] Write failing tests for create/update, hashing, email conflict, management boundaries, and self-deactivation.
- [x] Implement employee management with safe outputs and audit.
- [x] Route active employee list/create/update UI through APIs.

### Task 4: Audit and verification

- [x] Write failing pagination/filter/authorization/secret-redaction tests.
- [x] Implement management audit endpoint and UI state.
- [x] Run full unit/static/MySQL, syntax/diff/audit, browser proof, docs, and Phase 9 evidence.
