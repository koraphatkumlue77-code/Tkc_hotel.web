# Phase 1 Database and Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a recoverable 19-table development database, isolated real-MySQL test database, canonical database artifacts, and a single Express process that serves the landing page and health APIs.

**Architecture:** Preserve the current development data through a scripted SQL backup, apply the reviewed Plan B migration with an administrative connection, then export the final schema as the canonical source for test resets. Separate app/config creation from process startup so unit and integration tests never bind or mutate the wrong target.

**Tech Stack:** Node.js ES modules, Express 5, mysql2/promise, dotenv, MySQL client tools, node:test

**Spec:** `docs/superpowers/specs/2026-11-15-local-full-stack-hotel-design.md`

## Global Constraints

- Do not run live DDL until a non-empty timestamped backup exists.
- Dropping legacy columns requires action-time confirmation.
- Refuse all reset/migration operations when the target is not explicitly selected.
- Test reset must require a database name ending in `_test`.
- Preserve 4 room types and 800 rooms.
- Do not expose database passwords in commands, output, source, or logs.

## Review Focus

- Backup failure must prevent migration.
- Partial Plan B state must be detected instead of rerunning blindly.
- Test reset must reject `tkc_hotel_dev` even when misconfigured.
- Static serving must not expose `.env`, database artifacts, or upload storage.
- Liveness must remain independent from MySQL while readiness reflects MySQL.

---

### Task 1: Canonical Migration Artifact and Contract Check

**Files:**
- Create: `database/Tkcdata.sql`
- Create: `api/test/schema-contract.test.js`
- Create: `api/scripts/check-schema.js`

**Interfaces:**
- Consumes: the reviewed Plan B SQL from the companion workspace.
- Produces: `checkSchemaSql(sqlText)` and a target-repository migration with exactly 19 expected tables and numbered migration markers.

- [ ] Write a failing contract test for the 19 table names, Plan B markers, postcheck, and absence of plaintext credentials.
- [ ] Run `npm test -- test/schema-contract.test.js` and confirm the missing module/artifact failure.
- [ ] Copy the reviewed SQL and implement `checkSchemaSql(sqlText)`.
- [ ] Run the focused test and full unit suite; expect PASS.

### Task 2: Safe Backup Command

**Files:**
- Create: `api/scripts/backup-database.js`
- Create: `api/test/backup-database.test.js`
- Modify: `api/package.json`
- Modify: `api/.gitignore`

**Interfaces:**
- Consumes: development DB config and `/usr/local/mysql/bin/mysqldump`.
- Produces: `npm run db:backup` and `database/backups/tkc_hotel_dev-<timestamp>.sql`.

- [ ] Write tests proving the backup command uses `--single-transaction`, `--skip-lock-tables`, `--no-tablespaces`, `--skip-triggers`, never places the password in argv, and rejects a non-development target.
- [ ] Run the tests and confirm RED for the missing implementation.
- [ ] Implement the spawn-based backup command with `MYSQL_PWD` only in the child environment and validate the output file is non-empty.
- [ ] Run tests and then `npm run db:backup`; inspect that the backup contains table DDL and data without exposing the password.

### Task 3: Preflight and Live Plan B Migration

**Files:**
- Create: `api/scripts/preflight-plan-b.js`
- Create: `api/test/preflight-plan-b.test.js`
- Create: `database/migration-record.md`

**Interfaces:**
- Consumes: `tkc_hotel_dev`, the backup path, and Plan B precheck queries.
- Produces: a machine-readable preflight result and a human execution record for numbered Workbench blocks.

- [ ] Write integration tests for clean legacy state, duplicate email, invalid money/date/status values, over-capacity legacy tour rounds, and partial Plan B detection.
- [ ] Run against `tkc_hotel_test_legacy` fixture and confirm RED before implementation.
- [ ] Implement read-only preflight queries and safe reporting.
- [ ] Run preflight on development and require all blocking counts to be zero.
- [ ] Confirm the backup path and request action-time approval for live blocks that drop legacy columns.
- [ ] Execute Plan B blocks in order through the existing administrative Workbench session, recording each successful block.
- [ ] Run postchecks: 19 tables, 800 rooms, required columns/FKs, and zero orphans.

### Task 4: Canonical Final Schema and Isolated Test Database

**Files:**
- Create: `database/schema.sql`
- Create: `database/seed.sql`
- Create: `api/scripts/reset-test-db.js`
- Create: `api/test/reset-test-db.test.js`
- Create: `api/.env.test.example`
- Modify: `api/.gitignore`
- Modify: `api/package.json`

**Interfaces:**
- Consumes: final migrated `tkc_hotel_dev` structure and test-only DB config.
- Produces: `npm run db:test:reset`, a seeded 19-table `tkc_hotel_test`, and DDL permission limited to the test schema.

- [ ] Write tests that reject missing test config and any database name without `_test` suffix.
- [ ] Run tests and confirm RED.
- [ ] Export the final no-data schema and deterministic catalog seed without customer/booking history.
- [ ] Implement reset using a test-admin connection and `multipleStatements` only inside the guarded reset script.
- [ ] Create `tkc_hotel_test` and grant `tkc_api` DDL/DML only on that test schema through Workbench.
- [ ] Run reset twice and verify identical 19-table inventory, 4 room types, and 800 rooms.

### Task 5: Single-Process Static Runtime

**Files:**
- Modify: `api/app.js`
- Modify: `api/server.js`
- Create: `api/config.js`
- Create: `api/test/static-runtime.test.js`
- Modify: `api/test/health.test.js`
- Modify: `api/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: repository root path and validated runtime configuration.
- Produces: `createApp({ checkDatabase, publicRoot })`, `/` serving `index.html`, safe static assets, and unchanged `/api/health*` contracts.

- [ ] Write tests for `/`, `/style.css`, `/script.js`, API 404 JSON, and denial of `.env`, `database/`, `api/storage/`, and dotfiles.
- [ ] Run tests and confirm RED.
- [ ] Implement explicit static routes from the repository root and safe API not-found/error handling.
- [ ] Run full unit tests and start the local server.
- [ ] Verify `/`, `/api/health`, and `/api/health/db` in the browser.
- [ ] Update README with backup, preflight, migration, test reset, run, and verification commands.

### Task 6: Phase Verification

**Files:**
- Verify all Phase 1 files

**Interfaces:**
- Consumes: Tasks 1-5 outputs.
- Produces: a Phase 1 evidence record ready for the authentication phase.

- [ ] Run `npm test` with zero failures.
- [ ] Run `npm run db:test:reset` and a real-MySQL smoke query.
- [ ] Verify the API account cannot execute DDL on `tkc_hotel_dev`.
- [ ] Verify the development backup remains readable and non-empty.
- [ ] Run a fresh code review against the design and Phase 1 plan; fix Critical/Important findings through RED-GREEN tests.
