# Phase 6 Assignment and Stay Evidence

Verified: 2026-11-16 (Asia/Bangkok)

## Delivered

- Role-correct online and Walk-in physical-room assignment and reassignment.
- Transactional room/type/capacity/current-state/stay-overlap validation with preserved history.
- Complete-assignment Check-in that records actor/time and moves rooms to `OCCUPIED`.
- Date-safe No-show with declared late-arrival protection.
- Inert reception emergency-move requests and one-time management decisions.
- Approved emergency moves transfer occupancy and queue cleaning for the old room.
- Check-out net-balance enforcement across completed incoming and outgoing payments.
- Atomic Check-out booking/assignment/room updates and one cleaning event per occupied room.
- Append-only audit evidence for every stay transition.
- Staff booking detail now selects only the latest effective room assignment.

## Automated proof

From `api/`:

```text
npm test
  55 passed, 0 failed

npm run test:db
  34 passed, 0 failed
```

The new MySQL suite proves assignment role isolation, replacement history, overlap conflicts,
staff-detail correctness, incomplete Check-in rejection, occupied room state, late-arrival
No-show timing, emergency approval, cleaning creation, repeated-decision rejection, outstanding
balance rejection, successful paid Check-out, and persisted final states.

Focused syntax checks for the new routes/repository and the full regression suites also passed.
