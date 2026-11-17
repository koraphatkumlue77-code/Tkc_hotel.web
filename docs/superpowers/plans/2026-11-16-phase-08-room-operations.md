# Phase 8: Room Operations Implementation Plan

**Goal:** Deliver durable housekeeping, damage, closure, and room-history workflows.

**Architecture:** Add a `room-operations` module using `RoomEvent` as append-only workflow state. Reuse room `status_version`, auth/audit helpers, and a private upload helper modeled after payment proof storage.

---

### Task 1: Cleaning lifecycle

- [x] Write failing MySQL tests for queue listing, start order, completion, role isolation, and audit.
- [x] Implement transactional queue/start/complete endpoints.
- [x] Prove completion restores availability only without an active closure.

### Task 2: Damage reports

- [x] Write failing contract/upload/access tests.
- [x] Implement private photo storage, housekeeping reports, staff-only delivery, and failed-mutation cleanup.
- [x] Implement management review/resolve append-only events and prove original report immutability.

### Task 3: Closure, reopen, and history

- [x] Write failing period/version/occupied-room/reopen tests.
- [x] Implement effective closure and related reopen events with optimistic room versioning.
- [x] Implement paginated room history and prove concurrent version conflict behavior.

### Task 4: Frontend and verification

- [x] Route active housekeeping, reception, and management room-operation views through APIs and `FormData` upload.
- [x] Render housekeeping, reception, and management loading/empty/error states from MySQL.
- [x] Run full unit/static/MySQL, syntax/diff/audit, private-file, and browser proof.
- [x] Document Phase 8 and write evidence.
