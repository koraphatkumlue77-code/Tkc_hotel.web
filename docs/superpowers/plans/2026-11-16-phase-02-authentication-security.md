# Phase 2: Authentication and Shared Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add secure customer/employee authentication, database-backed session restoration, server-side roles, origin protection, validation, safe API errors, and audit logging with real-MySQL integration tests.

**Architecture:** Keep the single Express process. Authentication is a vertical module with a repository, service, routes, and shared middleware. A short-lived signed token is stored in an HTTP-only `SameSite=Strict` cookie, while every protected request reloads the principal from MySQL so suspension or deactivation takes effect immediately.

**Tech Stack:** Express 5, mysql2/promise, bcryptjs, jsonwebtoken, node:test, MySQL test schema

**Spec:** `docs/superpowers/specs/2026-11-15-local-full-stack-hotel-design.md`

## Task 1: Security Primitives and Contracts

- [ ] Add `bcryptjs` and `jsonwebtoken` dependencies.
- [ ] Extend runtime config with a required signing secret, cookie settings, and token lifetime.
- [ ] Add request IDs, typed API errors, safe JSON error responses, input validation helpers, and same-origin middleware.
- [ ] Prove config, validation, origin checks, and error redaction with unit tests.

## Task 2: Customer Registration

- [ ] Add the auth repository and customer registration service.
- [ ] Normalize email, validate customer identity fields, hash the password, and create an `ACTIVE` customer transactionally.
- [ ] Return `409` for duplicate email without exposing database errors.
- [ ] Write unit tests first, then real-database registration tests.

## Task 3: Login and Session Restoration

- [ ] Support explicit `customer` and `employee` login types.
- [ ] Verify bcrypt hashes, update customer `last_login_at`, and issue a short-lived signed cookie.
- [ ] Implement authentication middleware that verifies the token and reloads an active principal on every request.
- [ ] Add `GET /api/auth/me` and `POST /api/auth/logout`.
- [ ] Prove invalid credentials, tampered/expired tokens, deactivated accounts, cookie attributes, and safe principal responses.

## Task 4: Roles and Audit Helper

- [ ] Normalize employee database roles to `reception`, `accounting`, `housekeeping`, `superadmin`, or `management`.
- [ ] Add reusable authenticated and role-authorization middleware.
- [ ] Add an audit helper that writes actor-safe JSON without passwords, tokens, cookies, or database errors.
- [ ] Prove allowed/denied roles and customer/employee/system audit rows.

## Task 5: Real-Database Authentication Coverage

- [ ] Add deterministic customer and employee fixtures to the isolated test database.
- [ ] Exercise register, customer login, employee login, session restoration, logout, duplicate registration, suspension/deactivation, and audit persistence through HTTP.
- [ ] Guard every integration test against any database not ending in `_test`.

## Task 6: Documentation and Verification

- [ ] Update environment examples and README with secret generation, auth endpoints, cookie behavior, and test commands.
- [ ] Run the focused unit tests, full unit suite, database reset, full database integration suite, and local HTTP smoke test.
- [ ] Record Phase 2 evidence and request a focused code review before proceeding to Phase 3.
