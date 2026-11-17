# Staff Live Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display newly created MySQL bookings in the permitted staff dashboards.

**Architecture:** Replace the shared static booking-history template with one API-backed list/detail renderer. Reuse the existing staff booking endpoints and existing role/session flow.

**Tech Stack:** Browser JavaScript, Express API, MySQL, Node test runner

**Spec:** `docs/superpowers/specs/2026-11-16-staff-live-bookings-design.md`

## Global Constraints

- Do not change the database schema or staff booking API.
- Preserve the accounting payment queue.
- Escape every API value inserted into HTML.

## Review Focus

- Empty booking list must render a clear state.
- API failure must not leave stale sample data.
- Only the current role's visible panel should be refreshed.
- Repeated refresh must not duplicate rows or handlers.
- Detail fetch must use the selected database booking ID.

---

### Task 1: Replace Static Staff Booking History

**Files:**
- Modify: `script.js`
- Test: `api/test/frontend-auth.test.js`

**Interfaces:**
- Consumes: `GET /api/staff/bookings?page=1&limit=50`, `GET /api/staff/bookings/:bookingId`
- Produces: `renderStaffBookingHistory(role)` and click-to-load live detail behavior

- [x] Add a failing static wiring regression proving both staff endpoints are consumed and the old fixed records are absent.
- [x] Run `node --test api/test/frontend-auth.test.js` and confirm the new assertion fails.
- [x] Implement the shared live list/detail renderer, loading/empty/error states, and refresh/select handlers.
- [x] Call the renderer when superadmin, reception, or management enters its panel.
- [x] Run frontend tests, the full unit suite, and `git diff --check`.
