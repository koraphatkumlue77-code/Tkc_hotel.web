# Phase 8: Room Operations Design

## Goal

Persist the housekeeping and repair lifecycle in `RoomEvent`, replace browser-only room maps, protect damage photos, and keep room status/version consistent under concurrent staff actions.

## API

- `GET /api/housekeeping/cleaning` lists the latest open cleaning work.
- `POST /api/housekeeping/cleaning/:eventId/start` starts queued work.
- `POST /api/housekeeping/cleaning/:eventId/complete` completes started work.
- `POST /api/housekeeping/rooms/:roomId/damages` uploads one PNG/JPEG/WebP damage photo and report.
- `GET /api/room-events/:eventId/photo` returns a protected damage photo to authorized hotel staff.
- `GET /api/management/damages` lists damage history.
- `POST /api/management/damages/:eventId/review` records a management review.
- `POST /api/management/damages/:eventId/resolve` records resolution.
- `POST /api/management/rooms/:roomId/closures` creates an effective closure.
- `POST /api/management/room-closures/:eventId/reopen` reopens a closure.
- `GET /api/staff/rooms/:roomId/history` returns append-only room events.

## Rules

- Housekeeping starts only `CLEANING_QUEUED` events in `QUEUED`; completion requires the corresponding started event.
- Cleaning completion sets the room `AVAILABLE` only when no effective unreopened `ROOM_CLOSED` event exists. Otherwise it remains `OUT_OF_SERVICE`.
- Damage reports require item, description, current room version, and a validated private image. Failed transactions remove the uploaded file.
- Management review and resolution are append-only related events. Original damage rows and photos are never overwritten.
- Closure and reopen operations lock the Room, require `expectedVersion`, increment `status_version`, and create related append-only events.
- An occupied room cannot be closed. Reopen restores `AVAILABLE` only if cleaning is complete; otherwise it restores `NEEDS_CLEANING`.
- Every mutation creates an audit entry. Photo references never map to public static paths.

## Proof

Unit tests cover strict contracts and upload validation. Real-MySQL tests cover cleaning state order, closure/cleaning interaction, damage photo access, review/resolve history, closure periods, version conflicts, reopen state, and concurrent optimistic updates.
