# Phase 2 Authentication and Shared Security Evidence

Date: 2026-11-16 (Asia/Bangkok)

## Delivered

- Customer registration with normalized email, bcrypt password hashing, active membership, signed cookie, and audit row.
- Customer and employee login with explicit account type and five normalized staff roles.
- HTTP-only, `SameSite=Strict`, short-lived HS256 session cookie.
- Database reload of the principal on every protected request, including active/suspended checks.
- Session restoration (`GET /api/auth/me`) and cookie clearing (`POST /api/auth/logout`).
- Same-origin enforcement for unsafe API requests.
- Request IDs, validation errors, malformed-JSON handling, and safe internal error responses.
- Reusable authentication, role authorization, and sanitized audit helpers.

## Automated Proof

From `api/`:

```text
npm test
41 passed, 0 failed

npm run test:db
7 passed, 0 failed
```

The database suite runs with `--test-concurrency=1` and the reset guard requires a database name ending in `_test`. Authentication coverage uses `tkc_hotel_test` and verifies registration, duplicate conflict, customer login, employee login, session restoration, logout cookie clearing, suspended/deactivated principals, bcrypt persistence, and sanitized audit rows.

Dependency audit:

```text
npm audit --omit=dev
found 0 vulnerabilities
```

## Local Runtime Smoke Proof

Against `http://127.0.0.1:3000` with `tkc_hotel_dev`:

```text
GET /                 -> 200 (TKC landing page)
GET /api/health       -> 200
GET /api/health/db    -> 200
GET /api/auth/me      -> 401 without a session cookie
```

The runtime smoke test is read-only and did not create test users in the development database.

## Review Gate

A focused security review found no remaining Critical or Important issues after remediation. Clean `npm ci`, all 41 unit tests, all 7 real-database tests, dependency audit, and local runtime smoke checks passed. Verdict: ready for Phase 3.
