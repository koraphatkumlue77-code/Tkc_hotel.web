# Phase 1 Evidence — Foundation and Migration

Verified: 2026-11-16 (Asia/Bangkok)

## Development database

- `tkc_hotel_dev`: 19 tables, 800 rooms, 1 preserved customer
- Plan B postcheck: 31 foreign keys inspected; 25 orphan checks returned zero
- `tkc_api` development grant: SELECT, INSERT, UPDATE, DELETE only
- B-11 destructive column removal had explicit action-time approval
- Execution details: `database/migration-record.md`

## Backup evidence

- Original pre-migration safety backup:
  `database/backups/tkc_hotel_dev-20261115T161134Z.sql`
- Latest verified backup:
  `database/backups/tkc_hotel_dev-20261115T172643Z-ac8b4785-362e-42db-93ad-be116011e606.sql`
- Latest size: 113,557 bytes
- Latest SHA-256: `b042fc9df79d43146042808b051538a738a5a79e312a99dce2d43b016dc6c5ba`
- Validation requires at least 12 table DDL statements, required core tables,
  RoomType and Room data statements, and no embedded credentials
- Publication uses a UUID filename and no-overwrite hard-link; no partial files remain

## Automated verification

- `npm test`: 30 passed, 0 failed
- `npm run test:db`: 6 passed, 0 failed against real MySQL
- Integration coverage:
  - clean legacy preflight
  - duplicate/invalid/over-capacity blockers
  - partial B-01/B-02 rejection
  - complete B-01/B-02 resume acceptance
  - full Plan B migration compared with `database/schema.sql` across columns,
    constraints, key targets, referential rules, checks, and indexes
  - deterministic test reset
- `npm run db:test:reset`: 19 tables, 4 room types, 800 rooms, 5 services
- Test smoke query: 800 rooms across 4 room types

## Runtime verification

- Express serves `/`, `/style.css`, and `/script.js` from one process
- `/api/health`: 200, API alive without touching MySQL
- `/api/health/db`: 200, database connected
- `.env`, dotfiles, `database/`, and API storage paths return 404
- Browser rendered `TKC | Never Wekes Hotel` at `http://127.0.0.1:3000/`

## Review

- Fresh Phase 1 review: no Critical or Important findings remaining
- Reviewer verdict: Ready to proceed to Phase 2

