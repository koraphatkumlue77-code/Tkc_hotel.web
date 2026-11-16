# Staff Live Bookings Design

## Intent

Fix the staff dashboards that currently show hard-coded booking history even though customer
bookings are persisted and already available through the staff booking API.

## Approach

Use the existing authenticated `GET /api/staff/bookings` and
`GET /api/staff/bookings/:bookingId` routes. Superadmin, reception, and management dashboards
share one renderer, load on staff entry, expose a refresh action, and open real booking detail.
Accounting keeps its dedicated payment queue. No new endpoint or schema change is required.

## Acceptance

- A newly persisted booking appears in the allowed staff dashboards after entry or refresh.
- List and detail values are escaped and come only from the API.
- Loading, empty, and API error states remain visible.
- The old hard-coded booking records are no longer rendered.

