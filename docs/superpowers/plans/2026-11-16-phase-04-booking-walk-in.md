# Phase 4: Booking and Walk-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Persist customer and reception walk-in bookings with concurrency-safe inventory, price snapshots, holds, promotions, history, cancellation, and late-arrival handling.

**Architecture:** Booking creation runs in a transaction that locks the selected `RoomType` rows, recalculates current availability, validates capacity, snapshots all prices, creates a unique booking code, and applies a 15-minute hold. Customer queries are always owner-scoped; staff queries are server-role scoped. No browser-calculated amount is trusted.

**Tech Stack:** Express 5, mysql2/promise transactions, existing auth/rooms/audit modules, node:test, MySQL

## Task 1: Booking Contracts and Fixtures

- [ ] Define request/response fields, status constants, channel constants, and reusable booking fixtures.
- [ ] Add strict date, room selection, guest count, service selection, and promotion-code validation.
- [ ] Prove validation and safe decimal serialization with unit tests.

## Task 2: Transactional Customer Booking

- [ ] Add `POST /api/bookings` for authenticated customers.
- [ ] Lock room types and availability responsibility rows, then reject insufficient inventory with `409`.
- [ ] Snapshot nightly rates, breakfast/add-on rates, subtotals, discounts, deposit rate, and total.
- [ ] Create a unique booking code and 15-minute `PENDING_PAYMENT` hold with audit history.
- [ ] Prove success, capacity rejection, overlap, expired-hold release, and concurrent last-room attempts on real MySQL.

## Task 3: Promotions During Booking

- [ ] Validate entered active codes at booking creation time.
- [ ] Apply eligible codes by priority then promotion ID against the remaining room subtotal.
- [ ] Persist `BookingPromotion` snapshots and return the calculation breakdown.
- [ ] Prove stacking order, invalid/expired codes, and non-negative totals.

## Task 4: Customer Booking History and Detail

- [ ] Add bounded `GET /api/bookings/mine` and owner-scoped `GET /api/bookings/:bookingId`.
- [ ] Return rooms, services, promotions, payment summary, and safe status timeline fields.
- [ ] Prove customer isolation and expired-hold representation.

## Task 5: Cancellation and Late Arrival

- [ ] Add customer cancellation for eligible pre-stay states.
- [ ] Add late-arrival declaration within the allowed booking window.
- [ ] Release inventory through state changes, preserve immutable financial/history rows, and audit both actions.
- [ ] Prove invalid transitions, ownership, idempotent repeats, and availability restoration.

## Task 6: Reception Walk-in and Staff Views

- [ ] Add reception walk-in creation with customer lookup/create, same-day inventory checks, price snapshots, and optional room assignment.
- [ ] Add role-scoped staff booking list/detail endpoints for reception, accounting, superadmin, and management.
- [ ] Prove role denial, walk-in persistence, and online/walk-in channel distinctions.

## Task 7: Frontend Booking Slice

- [ ] Replace browser-only booking creation/history with the booking APIs.
- [ ] Use the restored customer session, show hold expiry and server-calculated totals, and render loading/validation/conflict states.
- [ ] Complete a visible browser flow from login through booking persistence and reload.

## Task 8: Verification and Review

- [ ] Document endpoints and local workflow.
- [ ] Run clean install, unit, serial real-MySQL, concurrency, browser, audit, and smoke checks.
- [ ] Record evidence and focused review before Phase 5.
