# Housekeeping cleaning flow

## Intent

Let housekeeping process rooms after checkout without making them bookable before cleaning is complete, while retaining damage reports for management review.

## Goals

- Show queued cleaning work on the housekeeping page.
- Let housekeeping start a task; show it as `กำลังทำความสะอาด` and exclude the room from booking availability while the task is open.
- Let housekeeping complete the task; restore the room to `AVAILABLE` unless management has an active room closure, in which case keep it `OUT_OF_SERVICE`.
- Record damage reports with photo and details. A report alone does not close or block the room; management decides whether to close it.
- Fix the housekeeping page's damage-room selector so loading room options does not break rendering of the cleaning queue.

## Non-goals

- Add a room status or database table.
- Automatically close a room when a damage report is filed.
- Change management's existing room closure workflow.

## Approaches

1. Use existing `RoomEvent` cleaning events and current room statuses. This fits the existing schema and avoids SQL migration. **Selected.**
2. Add a distinct `CLEANING` value to `Room.current_status`. This is more explicit but requires changing the database status constraint, room status policies, summaries, and API validation.

## Behavior and implementation notes

- Keep `CLEANING_QUEUED`, `CLEANING_STARTED`, and `CLEANING_COMPLETED` as the source of cleaning-task state.
- Prevent booking availability calculations from counting rooms with an open cleaning task. Avoid subtracting the same room twice if it is also under an active management closure.
- Preserve the existing completion rule: active closure means `OUT_OF_SERVICE`; otherwise `AVAILABLE`.
- Keep housekeeping damage reports informational. Management uses the existing closure action when a room must be removed from service.
- Fix the selector update to target the existing `<select>` directly and retain a placeholder option.

## Acceptance checks

- A checked-out room appears in the queue and cannot be booked while cleaning is queued or started.
- Starting work shows `กำลังทำความสะอาด`; completing it removes the queue item and makes the room bookable again unless a closure remains active.
- Filing a damage report records its photo/details without changing booking availability; management can close the room separately.
- Loading room choices does not replace or hide the cleaning queue with a selector error.
