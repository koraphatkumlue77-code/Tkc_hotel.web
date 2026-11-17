# Phase 9: Reviews, Chat, Employees, and Audit Design

## Goal

Complete the remaining customer/staff collaboration APIs and remove local-only review, chat, employee, and audit behavior.

## API

### Reviews

- `GET /api/reviews` lists published reviews with safe guest/room labels.
- `POST /api/bookings/:bookingId/reviews` creates one owner review after `CHECKED_OUT`.
- `POST /api/staff/reviews/:reviewId/hide` lets Superadmin hide a published review with a reason.

### Chat

- `GET/POST /api/chat/messages` lists/sends the authenticated customer's messages.
- `GET /api/reception/chats` lists customer conversations and unread counts.
- `GET/POST /api/reception/chats/:customerId/messages` lets Reception read/reply and marks customer messages read.

Polling is used; WebSockets remain out of scope. Text is plain text, trimmed, at most 1,000 characters.

### Employees

- `GET/POST /api/staff/employees` lists/creates employees for Management/Superadmin.
- `PATCH /api/staff/employees/:employeeId` updates name, department, role, and active state.

Passwords are hashed and never returned/audited. Management cannot create, promote, edit, or deactivate a Superadmin. An actor cannot deactivate their own account. Duplicate email returns 409.

### Audit

- `GET /api/management/audit` returns bounded paginated audit records with optional entity/action/employee filters.

Only Management and Superadmin can read audit history. Stored JSON is returned as parsed sanitized data; secrets remain excluded by the central audit writer.

## Proof

Real-MySQL tests cover review eligibility/uniqueness/moderation, chat ownership/unread/reply, employee role boundaries/password hashing/self-protection, and audit pagination/filtering without credential exposure.
