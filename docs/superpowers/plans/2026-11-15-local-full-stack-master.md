# TKC Hotel Local Full Stack Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete local TKC Hotel website, REST API, MySQL persistence, real-database integration tests, and browser end-to-end tests.

**Architecture:** Use one modular Express process to serve the existing frontend and `/api/*`. Deliver vertical slices in dependency order, with a separate detailed implementation plan and verification gate for each phase.

**Tech Stack:** Node.js 20+, Express 5, mysql2/promise, MySQL 26.7, node:test, Playwright

**Spec:** `docs/superpowers/specs/2026-11-15-local-full-stack-hotel-design.md`

## Global Constraints

- Business Rules override prototype behavior; final SQL overrides diagrams and drafts.
- Back up `tkc_hotel_dev` before live DDL.
- Integration tests run only against a database whose name ends in `_test`.
- The runtime account has no DDL permission on `tkc_hotel_dev`.
- Preserve the existing HTML/CSS visual design.
- No real gateway, cloud storage, email, SMS, or external authentication.
- Every API route needs real-MySQL integration coverage before completion.

## Review Focus

- No test command may mutate `tkc_hotel_dev`.
- Inventory and money changes must be transactional and concurrency-safe.
- Browser role controls must never replace server authorization.
- Uploads and API errors must not expose secrets or arbitrary local files.
- Demo browser state must be completely removed from acceptance flows.

---

### Phase 1: Database and Runtime Foundation

**Detailed plan:** `docs/superpowers/plans/2026-11-15-phase-01-foundation-migration.md`

Produces the verified 19-table development schema, isolated test database, canonical schema/seed/reset scripts, one-process static server, shared config, and integration-test guardrails.

### Phase 2: Authentication and Shared Security

**Detailed plan:** `docs/superpowers/plans/2026-11-16-phase-02-authentication-security.md`

Produces registration, login, logout, session restoration, customer/employee principals, role middleware, origin protection, validation, error responses, audit helper, and integration fixtures.

### Phase 3: Room Catalog and Availability

**Detailed plan:** `docs/superpowers/plans/2026-11-16-phase-03-room-catalog-availability.md`

Produces public room types, date-range availability, staff room views, superadmin catalog maintenance, and concurrency-safe inventory queries.

### Phase 4: Booking and Walk-in

**Detailed plan:** `docs/superpowers/plans/2026-11-16-phase-04-booking-walk-in.md`

Produces customer booking, 15-minute holds, price snapshots, deposit calculation, promotion-code application, booking history/detail, cancellation, late arrival, and reception Walk-in flows.

### Phase 5: Payments and Accounting

**Detailed plan:** `docs/superpowers/plans/2026-11-16-phase-05-payments-accounting.md`

Produces protected proof upload, resubmission, accounting queues, approval/rejection, idempotent receipts, financial summaries, and rejected-proof hold expiry.

### Phase 6: Assignment and Stay

Produces role-correct room assignment/change, emergency move approval, Check-in, No-show, Check-out, cleaning queue creation, and balance enforcement.

### Phase 7: Services, Promotions, Tours, and Refunds

Produces booking add-ons, post-Check-in paid services, promotion management, attraction catalog, tour rounds/seats/pricing, refund requests, management decisions, and payouts.

### Phase 8: Room Operations

Produces housekeeping work lifecycle, damage photos, management review, effective closure/reopening, optimistic room versioning, and room history.

### Phase 9: Reviews, Chat, Employees, and Audit

Produces review eligibility/moderation, customer/reception polling chat, role-safe employee management, and paginated management audit views.

### Phase 10: Frontend API Conversion

Produces the same-origin API client, session restoration, API-driven public/customer/staff states, uploads, loading/error/empty states, and removal of in-memory demo records.

### Phase 11: Complete Verification and Handoff

Produces Playwright flows for all acceptance journeys, a clean test reset run, DDL-denial proof, README/runbook, and a fresh whole-system review.
