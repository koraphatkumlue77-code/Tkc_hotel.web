# Phase 3 Room Catalog and Availability Evidence

Date: 2026-11-16 (Asia/Bangkok)

## Delivered

- Public room-type catalog and date/capacity availability backed by MySQL.
- Availability includes confirmed stays and unexpired holds, excludes expired holds, subtracts effective room closures, and ignores today's operational status for future searches.
- Authorized staff room list with filters and bounded pagination.
- Role-protected optimistic room-status updates with audit rows.
- Superadmin room-type and room catalog creation/update with validation, conflict handling, optimistic versioning, and audit rows.
- Website search form now calls the real catalog and availability APIs.
- Website registration, login, session restoration, and logout now call the real authentication APIs.

## Browser Proof

The visible local website completed: customer registration, MySQL persistence, cookie session restoration after reload, logout, customer login, and `last_login_at` persistence. The created development fixture is `codex.browser.20261116@example.test` (customer ID 2).

## Safety

Automated mutation tests use only `tkc_hotel_test`. The only development-database mutation was the explicit browser end-to-end customer fixture above.

## Final Verification

```text
npm test       -> 44 passed, 0 failed
npm run test:db -> 11 passed, 0 failed
npm audit --omit=dev -> 0 vulnerabilities
```

Focused review found no remaining Critical or Important issues. The browser was reloaded against the latest local server and rendered all four room types from MySQL using stable database IDs. Verdict: ready for Phase 4.
