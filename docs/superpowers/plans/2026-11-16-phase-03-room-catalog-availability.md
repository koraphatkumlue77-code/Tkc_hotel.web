# Phase 3: Room Catalog and Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Provide public room types and date availability plus authorized staff room/catalog administration, backed by real MySQL tests.

**Architecture:** A rooms module owns explicit SQL and validation. Availability uses `[check_in, check_out)` overlap, counts each `BookingRoom` as one reserved unit, includes unexpired holds and active stays, subtracts effective room closures, and intentionally ignores a room's present operational status for future dates.

**Tech Stack:** Express 5, mysql2/promise, existing auth/role middleware, node:test, MySQL

## Task 1: Public Room Type Catalog

- [ ] Add repository/service/router for `GET /api/room-types`.
- [ ] Return decimal prices as strings and stable room type fields.
- [ ] Add HTTP integration coverage against seeded MySQL data.

## Task 2: Date-Range Availability

- [ ] Validate strict `YYYY-MM-DD`, future/valid date range, and optional guest capacity.
- [ ] Count overlapping active booking-room rows and only unexpired pending holds.
- [ ] Count rooms closed during the requested interval without using today's `current_status` as future availability.
- [ ] Add boundary, hold-expiry, closure, capacity, and malformed-date integration tests.

## Task 3: Staff Room Views

- [ ] Add authenticated `GET /api/staff/rooms` with bounded pagination and filters.
- [ ] Permit reception, accounting, housekeeping, superadmin, and management.
- [ ] Return operational status/version and room type data without sensitive records.

## Task 4: Room Status Mutation

- [ ] Add `PATCH /api/staff/rooms/:roomId/status` for authorized operational roles.
- [ ] Validate allowed transitions, reason, and optimistic `status_version`.
- [ ] Update atomically and write an employee audit row; return `409` on stale version.

## Task 5: Superadmin Catalog Maintenance

- [ ] Add create/update room-type endpoints and create/update room endpoints.
- [ ] Enforce superadmin server-side, unique room code conflicts, numeric constraints, and audit rows.
- [ ] Prove access denial and successful persistence with real-database tests.

## Task 6: Verification and Review

- [ ] Document endpoints and examples.
- [ ] Run clean install, unit suite, serial real-database suite, dependency audit, and local read-only smoke tests.
- [ ] Record evidence and complete focused review before Phase 4.
