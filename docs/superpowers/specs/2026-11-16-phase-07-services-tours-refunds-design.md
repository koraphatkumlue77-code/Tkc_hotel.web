# Phase 7: Services, Promotions, Tours, and Refunds Design

## Goal

Replace the remaining demo service/tour/promotion behavior with transactional MySQL APIs and complete the refund lifecycle without mutating original payment records.

## API surface

### Catalog and booking add-ons

- `GET /api/services` lists active non-tour hotel services.
- `GET /api/attractions` lists visible attraction content.
- `POST /api/bookings/:bookingId/services` lets the owning customer add an eligible service before Check-in.
- `POST /api/bookings/:bookingId/services/:bookingServiceId/cancel` cancels an unused customer add-on.
- `POST /api/staff/bookings/:bookingId/services` lets Reception add and fully collect a service after Check-in in one transaction.

Add-ons create `BookingService` and per-room/date `ServiceUsage` snapshots. Charge-unit rules are server-owned. A post-Check-in service creates an accepted `SERVICE_PAYMENT` and increases booking service/total snapshots by exactly the same amount, leaving no new balance.

### Promotion and attraction administration

- `GET/POST /api/staff/promotions` and `PATCH /api/staff/promotions/:promotionId` for Superadmin/Management.
- `POST /api/staff/attractions` and `PATCH /api/staff/attractions/:serviceId` for Superadmin/Management.

Codes are normalized uppercase and unique. Percent, priority, validity period, visibility, schedule JSON, and active state are validated server-side. Existing booking promotion snapshots never change.

### Tours

- `GET /api/tours/rounds?from=&to=` returns open rounds and server-derived remaining seats.
- `POST/PATCH /api/staff/tours/rounds` manages Night Market rounds.
- `POST /api/bookings/:bookingId/tours` adds one participant to one round.
- `POST /api/bookings/:bookingId/tours/:reservationId/cancel` cancels the owner's participant reservation.

The round row is locked before capacity is counted. Active booking holds, payment review, confirmed, late-arrival, and checked-in bookings consume seats; expired/cancelled/no-show reservations do not. The same participant's active uses on one Bangkok date are sequenced. Price is the tour service base rate multiplied by the daily sequence (50 for first use, 100 for second use with the canonical seed). Cancellation never contributes to a later sequence.

### Refunds

- `POST /api/accounting/payments/:paymentId/refund-requests` creates a bounded request tied to accepted incoming money.
- `GET /api/management/refunds` lists requests for Management/Accounting/Superadmin.
- `POST /api/management/refunds/:refundId/approve|reject` records the first management decision.
- `POST /api/accounting/refunds/:refundId/payout` creates one immutable outgoing payout.

Requested and paid refund totals can never exceed accepted incoming money. Request, decision, and payout rows are locked. Original incoming payment rows are never rewritten. Payout is idempotent and duplicate/concurrent payout attempts return the stored result or conflict without double money.

## Roles and state

- Customer mutations are owner-scoped and return 404 for another customer's booking.
- Reception handles post-Check-in services; Accounting requests and pays refunds; Management decides refunds; Superadmin/Management administer catalog metadata.
- Customer add-ons/tours require a live eligible booking and dates inside the stay.
- Every mutation writes `AuditLog`; money, tour capacity, and booking totals change inside transactions.

## Test proof

Unit tests cover strict contracts. Real-MySQL integration tests cover pricing snapshots, ownership, booking states, atomic staff service payment, catalog roles, tour final-seat races and daily pricing, refund bounds/decisions, and duplicate payout races.
