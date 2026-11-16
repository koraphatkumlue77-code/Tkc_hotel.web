# Phase 6: Assignment and Stay Design

## Goal

Persist the complete front-desk stay lifecycle in MySQL: role-correct physical-room assignment, pre-arrival room change, management-approved emergency move after check-in, Check-in, No-show, and Check-out with balance and cleaning enforcement.

## API

- `POST /api/staff/bookings/:bookingId/assignments` assigns or replaces the physical room for one `BookingRoom`.
- `POST /api/staff/bookings/:bookingId/check-in` checks in an eligible fully assigned booking.
- `POST /api/staff/bookings/:bookingId/no-show` records an eligible missed arrival.
- `POST /api/staff/bookings/:bookingId/emergency-moves` lets reception request a post-check-in move.
- `POST /api/management/emergency-moves/:assignmentId/approve` approves and executes a pending move.
- `POST /api/management/emergency-moves/:assignmentId/reject` rejects a pending move without changing occupancy.
- `POST /api/staff/bookings/:bookingId/check-out` checks out a paid booking and queues cleaning.

All endpoints require an authenticated employee and return `{ data }`. Validation failures use the existing error envelope.

## Rules

### Assignment

- Online bookings can be assigned or changed only by Superadmin.
- Walk-in bookings can be assigned or changed by Reception or Superadmin.
- Only `CONFIRMED` or `LATE_ARRIVAL` bookings may be assigned before Check-in.
- The booking room, physical room type, guest capacity, current room state, and stay overlap are checked inside one transaction while the relevant rows are locked.
- Replacing a future assignment keeps the old row as a zero-duration historical record and inserts a new assignment covering `[check_in_date, check_out_date)`.

### Check-in and No-show

- Reception or Superadmin can Check-in on or after the Bangkok arrival date and before checkout.
- A `CONFIRMED` or `LATE_ARRIVAL` booking must have one active assignment per booking room. Every assigned room must still be available.
- Check-in changes the booking to `CHECKED_IN`, records actor/time, and marks assigned rooms `OCCUPIED`.
- No-show is allowed on or after the booked arrival date for `CONFIRMED`; a `LATE_ARRIVAL` booking cannot be marked No-show before its declared arrival time.
- No-show ends assignments and records `NO_SHOW`; it does not create cleaning because the rooms were never occupied.

### Emergency move

- Reception requests a move only for `CHECKED_IN` bookings. The request is an inert zero-duration `RoomAssignment` plus an audit action, so it cannot affect availability before approval.
- Management approves or rejects each request once. Approval revalidates and locks inventory, ends the old assignment, activates the new assignment through checkout, sets the new room `OCCUPIED`, sets the old room `NEEDS_CLEANING`, and queues cleaning.

### Check-out

- Reception or Superadmin checks out only a `CHECKED_IN` booking.
- Net completed incoming payments minus completed outgoing payments must cover the booking total. Outstanding balance returns `409 BOOKING_BALANCE_DUE`.
- Check-out ends active assignments, marks rooms `NEEDS_CLEANING`, inserts one `CLEANING_QUEUED` event per room, and records actor/time and `CHECKED_OUT`.

## Persistence and audit

Every mutation uses a transaction and `SELECT ... FOR UPDATE`. Booking, assignment, emergency decision, Check-in, No-show, Check-out, room-state change, and cleaning creation produce append-only `AuditLog` or `RoomEvent` evidence. Financial rows are read only in this phase.

## Test proof

Unit tests cover request normalization. Real-MySQL integration tests cover role boundaries, wrong room type, overlapping assignment, complete Check-in, No-show timing, emergency approval/rejection, balance blocking, successful Check-out, room states, cleaning events, and audit rows.
