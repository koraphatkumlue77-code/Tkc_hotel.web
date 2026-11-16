# TKC Hotel Local Full Stack Design

## Intent

Turn the existing TKC Hotel prototype into a complete local application. A single Express process serves `index.html` as the landing page, the existing CSS and browser JavaScript, uploaded development files, and every REST API used by the customer and staff flows. All business data must persist in MySQL, and every API route must have integration coverage against a real isolated MySQL test database.

The project remains local-first. It must start with documented commands on the user's Mac and must not require a cloud service, payment gateway, object store, email provider, or external identity provider.

## Current State

- The frontend is a single-page prototype in `index.html`, `style.css`, and `script.js`.
- `script.js` currently keeps customers, bookings, staff activity, payments, room states, chat, and service selections in browser memory.
- Express currently exposes only `GET /api/health` and `GET /api/health/db`.
- The live `tkc_hotel_dev` database has the 12 legacy tables, four room types, and 800 seeded rooms.
- The approved Plan B design expands the schema to 19 tables and adds the fields required for membership, payment/refund workflows, room operations, promotions, tours, reviews, chat, and audit history.

## Goals

- Serve the complete website from `http://localhost:3000` with `index.html` as `/`.
- Replace browser-only demo state with API calls and persistent MySQL records.
- Support customer and employee authentication and role checks.
- Implement every customer and staff service already represented by the website.
- Preserve the existing visual design and responsive behavior unless an API state requires a small UI addition.
- Use transactions, row locks, validation, foreign keys, and idempotency where concurrent requests can corrupt inventory or money.
- Prove every API route against `tkc_hotel_test`, not mocks alone.
- Keep `tkc_hotel_dev` data separate from test fixtures.

## Non Goals

- Public Internet deployment or production hardening for multiple hotel branches
- Real payment gateway, bank slip OCR, email, SMS, push notifications, or social login
- Cloud file storage
- Rewriting the frontend in React, Vue, or another framework
- Mobile native applications

## Selected Approach

Use a modular Express monolith that serves both static frontend files and `/api/*` routes from the same origin. Build the system as vertical slices so each phase produces a usable flow from browser to MySQL. Keep SQL explicit through `mysql2/promise`; do not introduce an ORM over the existing schema.

Alternatives considered:

- Separate Live Server and API processes were rejected because they add CORS, two startup commands, and inconsistent local URLs.
- A frontend framework rewrite was rejected because it does not advance database integration and would discard the existing interface.
- A big-bang route layer in one file was rejected because authentication, booking, payments, room operations, and staff functions need separate ownership and focused tests.

## Source Precedence and Resolved Product Decisions

When artifacts disagree, the Thai Requirements and Business Rules document is authoritative for behavior, the final 19-table SQL is authoritative for persisted structure, this design is authoritative for API boundaries, and the existing prototype is authoritative only for visual presentation.

The following decisions close gaps found during the builder review:

- Acceptance includes Walk-in booking, room and room-type administration, and on-screen financial summaries. CSV/PDF export is deferred because the current prototype does not provide a completed export workflow.
- Fitness, sauna, pool, and breakfast are booking add-ons. A customer must select an eligible booking; the standalone-looking prototype cards open that booking-service flow. Sunset content is an attraction card, not a reservable tour. Night Market is the reservable capacity-limited tour.
- Superadmin assigns or changes rooms for confirmed online bookings. Reception may assign rooms for Walk-in bookings and may execute an approved post-check-in emergency move. Management approval is required for an emergency move.
- Reception records and receives full payment for services added after Check-in. These transactions are immediately confirmed when recorded; accounting can inspect them but does not add a second approval step.
- When accounting rejects an initial proof, the booking keeps its inventory for 30 minutes from rejection. A valid resubmission returns it to accounting review and extends the hold through review. If no resubmission arrives, the booking expires and releases rooms and tour seats.
- Tour selections reserve seats during the booking's initial 15-minute hold and continue to reserve them while payment proof is under review. Expired or canceled selections release seats. Canceled tour uses do not count toward the participant's first/second-use daily price sequence.
- If an accounting approval races with capacity, the existing active hold wins; approval never silently removes a seat. Missing or expired holds produce a conflict for staff resolution rather than an inconsistent confirmation.
- Promotions are entered as codes by the customer. A code is eligible when active and its validity window contains the booking creation time. Multiple codes are applied in ascending priority and then promotion ID order, one after another against the remaining room subtotal.
- The agent may prepare and verify migration commands, but must create a backup first. Any step that drops legacy columns or otherwise irreversibly removes live data requires action-time confirmation even though the migration scope is approved.

## Local Runtime

- Node.js 20 or newer
- Express 5
- MySQL 26.7-compatible SQL
- One command starts the application after configuration: `npm run dev`
- Express serves the repository root as static content and sends `index.html` for `/`.
- API routes live under `/api` and return JSON except protected file-download routes.
- Development uploads are stored under `api/storage/` and ignored by Git.

## Database Strategy

### Development Database

`tkc_hotel_dev` is the local application database. Before migration, create a timestamped SQL backup. Apply the Plan B migration exactly once in numbered blocks and verify all 19 tables, foreign keys, room counts, and orphan checks.

The runtime account `tkc_api` receives only `SELECT`, `INSERT`, `UPDATE`, and `DELETE`. Schema creation and migrations use an administrative account.

### Test Database

`tkc_hotel_test` is created from the same final schema and seed definitions. Integration tests may truncate and reseed this database but must refuse to run if `DB_NAME` does not end in `_test`. Tests never use the development `.env` file implicitly.

Use `api/.env.test` for test-only credentials and keep it out of Git. Provide `.env.test.example` without real credentials.

### Data Safety

- Booking availability, room assignment, tour capacity, payment approval, refunds, and room state changes run inside transactions.
- Lock the responsible rows with `SELECT ... FOR UPDATE` before evaluating capacity or financial limits.
- Use `[check_in_date, check_out_date)` for stay overlap.
- Never update original incoming payment rows to represent refunds.
- Never hard-delete financial, room-event, review, chat, or audit history.
- Tests generate unique record prefixes and clean only their own test database.

## Application Structure

```text
api/
├── app.js
├── server.js
├── config.js
├── db.js
├── middleware/
│   ├── auth.js
│   ├── errors.js
│   ├── origin.js
│   └── validate.js
├── modules/
│   ├── auth/
│   ├── rooms/
│   ├── bookings/
│   ├── payments/
│   ├── stays/
│   ├── services/
│   ├── tours/
│   ├── promotions/
│   ├── room-operations/
│   ├── reviews/
│   ├── chat/
│   ├── employees/
│   └── audit/
├── storage/
├── test/
│   ├── integration/
│   ├── helpers/
│   └── unit/
└── scripts/
    ├── migrate.js
    ├── seed.js
    └── reset-test-db.js
```

Each module owns its router, validation schemas, service logic, SQL repository, and integration tests. Shared middleware handles authentication, role enforcement, validation errors, not-found responses, and safe server errors.

## Authentication and Authorization

- Customer registration stores a `bcryptjs` password hash in `Customer.password_hash` and sets member status to active.
- Employee accounts use `Employee.password_hash`.
- Login returns a signed short-lived token in an HTTP-only, `SameSite=Strict` cookie.
- Unsafe requests must come from the same origin; reject mismatched `Origin` headers.
- Authentication middleware reloads the customer or employee record and checks `active` on every protected request.
- Logout clears the cookie.
- Customer, reception, accounting, housekeeping, superadmin, and management permissions are enforced server-side from the employee role.
- Browser role selectors are display controls only and never authorize an action.
- Passwords, hashes, cookies, database errors, and secret environment variables never appear in API responses or audit JSON.

## Local File Handling

- Use `multer` with explicit file-size and MIME-type limits.
- Store payment proofs and damage photos in separate ignored directories with generated names.
- Save only the relative reference in MySQL.
- Serve files through authenticated routes that verify the requester may access the related booking or operational record.
- Removing an uncommitted upload after a failed transaction is best-effort; a cleanup script removes orphan files.

## API Conventions

- JSON success responses use the resource or a `{ data, meta }` envelope for lists.
- Validation errors return HTTP 400 with field-safe details.
- Authentication failures return 401; role failures return 403; missing resources return 404; state conflicts return 409.
- Unexpected errors return HTTP 500 with a request ID and no raw SQL or stack trace.
- List endpoints support bounded pagination.
- Dates use `YYYY-MM-DD`; timestamps are ISO 8601 strings.
- Monetary values are returned as decimal strings to avoid floating-point loss.
- Mutating payment endpoints accept an idempotency key.

## API Inventory

### Platform and Authentication

- `GET /api/health`
- `GET /api/health/db`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Room Catalog and Availability

- `GET /api/room-types`
- `GET /api/rooms/availability`
- `GET /api/staff/rooms`
- `PATCH /api/staff/rooms/:roomId/status`

Availability counts active holds and confirmed bookings, subtracts rooms closed for the requested period, and does not treat a room's status today as its future booking status.

### Bookings

- `POST /api/bookings`
- `GET /api/bookings/mine`
- `GET /api/bookings/:bookingId`
- `POST /api/bookings/:bookingId/payment-proof`
- `POST /api/bookings/:bookingId/payment-proof/resubmit`
- `POST /api/bookings/:bookingId/cancel`
- `POST /api/bookings/:bookingId/late-arrival`
- Staff list/detail endpoints for reception, accounting, superadmin, and management
- Reception Walk-in booking endpoint
- Superadmin room-type and room catalog maintenance endpoints

Creating a booking validates all room lines, creates a 15-minute hold, snapshots prices, applies ordered promotions to room charges only, adds selected services, and calculates the 20% or 40% deposit rule or full payment.

### Payments and Refunds

- Accounting payment queue and detail endpoints
- Approve or reject submitted proof
- Record balance and post-check-in service payments
- Create refund request
- Management approve or reject refund request
- Accounting record refund payout
- Management and accounting financial summary endpoints

Local payment is simulated through proof upload and staff approval. There is no external gateway. Refund requests and payouts are separate typed Payment rows.

### Stay and Room Assignment

- Assign, change, or approve a room assignment
- Check in and check out a booking
- Record no-show and late-arrival outcomes
- Prevent wrong room type, capacity overflow, and overlapping assignments

### Services, Promotions, and Tours

- Public service catalog and visible attraction endpoints
- Add or cancel eligible booking services
- Staff create/update promotions and attractions
- List tour rounds and remaining seats
- Add or cancel tour participants
- Enforce ten-seat capacity and per-participant daily usage pricing

### Housekeeping and Room Operations

- Cleaning queue, start, and completion
- Damage report with photo
- Management damage review
- Close and reopen room with reason and effective period
- Cleaning completion cannot reopen a room closed for repair

### Reviews, Chat, Employees, and Audit

- Eligible customer creates and lists reviews
- Superadmin hides a review with reason
- Customer and reception send/list chat messages
- Browser polls chat periodically; WebSockets are deferred
- Management and superadmin manage allowed employee roles
- Management reads paginated audit history

## Frontend Integration

- Keep the existing HTML and CSS structure.
- Replace demo arrays and maps in `script.js` with a small `apiFetch` client and feature-specific state loaded from APIs.
- Render loading, empty, success, validation, unauthorized, conflict, and server-error states.
- Restore the authenticated session through `GET /api/auth/me` on page load.
- Refresh only the affected view after a mutation.
- Use `FormData` for proof and damage-photo uploads.
- Keep a small, explicit demo seed in MySQL instead of JavaScript constants.
- Staff dashboards display only server-authorized actions for the logged-in role.

## Testing Strategy

### Route Contract Tests

Every route has tests for its success response, validation failure, unauthenticated request, unauthorized role where applicable, missing resource, and relevant state conflict.

### Real Database Integration Tests

Every repository and mutating route test runs against `tkc_hotel_test`. Tests assert both the HTTP response and resulting rows. Transactional rules receive concurrent-request tests for:

- last available room hold
- duplicate room assignment
- final tour seat
- repeated payment idempotency key
- duplicate refund payout
- optimistic room status version

### Browser End to End Tests

Use Playwright against the running local server and test these complete flows:

1. Register, log in, search availability, create booking, upload proof, and see pending status.
2. Accounting approves proof and the booking becomes confirmed.
3. Reception assigns a room, checks in, adds a paid service, and checks out.
4. Housekeeping completes cleaning and reports damage; management closes and reopens the room.
5. Customer creates a review and chat message; authorized staff responds or hides content.
6. Tour booking respects capacity and daily price sequence.

The suite captures no real password, proof, or customer data in committed fixtures.

## Delivery Sequence

1. Backup, migrate, verify, and clone the test schema.
2. Restructure Express and serve the existing landing page.
3. Add shared security, validation, error, fixture, and test infrastructure.
4. Authentication and customer membership slice.
5. Room catalog, availability, and booking slice.
6. Payment proof and accounting approval slice.
7. Assignment, check-in, services, and check-out slice.
8. Promotions, tours, refunds, and management slice.
9. Housekeeping and room operations slice.
10. Reviews, chat, employee access, and audit slice.
11. Replace remaining frontend demo state and run the complete E2E suite.

Each slice ends with unit tests, real-MySQL integration tests, relevant browser tests, README updates, and a review before the next slice starts.

## Completion Criteria

- `npm run dev` starts one local process and `/` renders the landing page.
- No user-facing workflow depends on browser demo maps or hard-coded credentials.
- All declared API routes are implemented and documented.
- Every route has real-database integration coverage.
- Integration and E2E suites pass from a clean `tkc_hotel_test` reset.
- Development data survives server and browser restarts.
- The API account cannot perform DDL.
- README contains exact setup, migration, seed, run, test, backup, and reset commands.
