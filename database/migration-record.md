# Plan B Migration Record

Target: `tkc_hotel_dev` on local MySQL (`127.0.0.1:3306`)

Canonical SQL: `database/Tkcdata.sql`

## Safety backup

- Created: 2026-11-15 23:11 Asia/Bangkok
- File: `database/backups/tkc_hotel_dev-20261115T161134Z.sql`
- Size: 64,777 bytes
- SHA-256: `1db776d6cf0609fdf2bce43b06109d6dcaf3128471e1d51b413ec62f36096ee3`
- Contents verified: 12 table definitions, 4 data insert statements, no embedded user/password statements

## Preflight

- Read-only legacy data checks: PASS (all invalid/duplicate/over-capacity counts are zero)
- Legacy table count: PASS (12)
- Existing Plan B state: B-01 and B-02 were already completed before this execution
- B-01 verification: all expected Customer columns, unique email constraint, and member credential check exist
- B-02 verification: all expected Booking columns, unique booking code, three employee foreign keys, two check constraints, and availability index exist
- Resume command: `node api/scripts/preflight-plan-b.js --resume-after=2`
- Resume result: PASS with zero blockers

## Execution ledger

| Block | Status | Notes |
|---|---|---|
| B-01 | Pre-existing, verified | Customer member/walk-in structure complete |
| B-02 | Pre-existing, verified | Booking API/snapshot structure complete |
| B-03 | Complete | Existing `Payment.rejection_reason` was verified compatible; resume SQL skipped only that duplicate ADD COLUMN |
| B-04 | Complete | Room physical status structure applied |
| B-04A | Complete | Legacy value checks applied |
| B-05 | Complete | Service catalog structure and seeds applied |
| B-06 | Complete | BookingService renamed to `service_id` |
| B-07 | Complete | Promotion created |
| B-08 | Complete | BookingPromotion created |
| B-09 | Complete | RoomEvent created |
| B-10 | Complete | TourRound created; Night Market tour seed verified |
| B-11 | Complete | User approved at action time; legacy values migrated first, then `tour_date` and `start_time` dropped |
| B-12 | Complete | Review created |
| B-13 | Complete | ChatMessage created |
| B-14 | Complete | Employee API fields and AuditLog created |

Do not rerun B-01 or B-02. MySQL DDL commits per statement; if a later block fails, inspect the exact schema state before resuming.

Verification after B-10: 16 tables, all four B-07..B-10 tables present, one Night Market `TOUR` service, and zero legacy tour reservation rows. Temporary DDL privileges were granted to `tkc_api` for the migration only and must be revoked after B-14.

## Final postcheck

- Expected tables: 19/19
- Rooms: 800 total (`300 Standard`, `250 Deluxe`, `150 Superior`, `100 Family`)
- Foreign keys inspected: 31
- Orphan relationship checks: 25/25 returned zero
- TourReservation: new round/participant structure verified; legacy date/time columns absent
- Temporary DDL privileges: revoked; `tkc_api` returned to SELECT, INSERT, UPDATE, DELETE only
