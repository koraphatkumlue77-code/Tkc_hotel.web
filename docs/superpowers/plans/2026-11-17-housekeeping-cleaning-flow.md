# Housekeeping Cleaning Flow Implementation Plan

**Goal:** Make the housekeeping queue reliable, prevent bookings while cleaning is open, and keep damage reports informational until management closes a room.

**Architecture:** Reuse `RoomEvent` cleaning events and existing `Room.current_status` values. Count open cleaning tasks as unavailable inventory, and restore availability on completion only when no active management closure remains.

**Tech Stack:** Node.js, Express, MySQL, vanilla JavaScript, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-11-17-housekeeping-cleaning-flow-design.md`

## Global Constraints

- Do not add tables or room-status values.
- Damage reports record photo and details; management closes rooms separately.
- Preserve `OUT_OF_SERVICE` when a management closure remains active after cleaning.

## Review Focus

- Open queued and started cleaning tasks must both block booking availability.
- A room that is both closed and cleaning must not be subtracted from inventory twice.
- Completing cleaning restores availability only if there is no active closure.
- Damage reports must not change the room's availability status.
- The room selector must keep its placeholder and must not break queue rendering.

---

### Task 1: Fix housekeeping queue and labels

**Files:**
- Modify: `script.js`

- [ ] Write the room options directly into `#damage-room-choice` (the select itself), preserving a “เลือกห้อง” placeholder.
- [ ] Render open queue entries with localized `กำลังทำความสะอาด` when `startedAt` exists and retain the start/complete actions.
- [ ] Confirm syntax with `node --check script.js`.

### Task 2: Exclude open cleaning work from booking inventory

**Files:**
- Modify: `api/modules/rooms/repository.js`
- Modify: `api/modules/rooms/service.js`
- Modify: `api/modules/bookings/repository.js`

- [ ] Count distinct rooms with an unfinished `CLEANING_QUEUED` event by room type in public availability and booking creation checks.
- [ ] Count rooms blocked by cleaning and active closures as a distinct union so one room is not subtracted twice.
- [ ] Return availability as `max(0, totalRooms - reservedRooms - blockedRooms)`.
- [ ] Confirm syntax for each modified JavaScript module.

### Task 3: Preserve damage and closure behavior

**Files:**
- Modify: `api/modules/room-operations/repository.js` only if needed after Tasks 1–2.

- [ ] Verify that damage reporting records the event without changing `current_status`.
- [ ] Preserve completion behavior: active closure keeps `OUT_OF_SERVICE`; otherwise cleaning completion restores `AVAILABLE`.
- [ ] Run `git diff --check` and confirm the live server reloads the updated files.
