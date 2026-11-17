# Facility and Tour Booking Design

## Intent

Make the customer-facing fitness, sauna, sunset, and night-market cards create real database reservations. Customers must be able to select more than one participant, see only bookable rounds, and never be sent through payment for a tour.

## Approved Rules

- Fitness costs 500 THB per person and has a shared capacity of 40 people per date/time round.
- Sauna costs 300 THB per person. It has no shared capacity rule in this scope; the selected quantity is still limited by the booked room's guest count.
- Paid add-ons may be attached to a live `PENDING_PAYMENT`, `CONFIRMED`, or `LATE_ARRIVAL` booking. A pending booking must have an unexpired hold.
- A customer cannot select more people than the guest count stored on the selected `BookingRoom`.
- Sunset tours are free and offer two locations: `เกาะสวรรค์` and `ริมชายหาด`.
- Each sunset location offers rounds at 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, and 18:30, with 10 seats per location/round.
- Night-market tours are free and offer rounds at 19:30, 20:00, and 20:30, with 10 seats per round.
- Customers see only open rounds with enough remaining seats for their selected party.
- Tour party reservations are atomic: either every requested participant receives a seat or none do.
- Tour totals display `ฟรี` and do not create or require a payment record.

## Architecture

Keep `TourRound` and `TourReservation` as the source of truth for tours. Store the locked recurring schedule in each tour `Service.schedule_json`; when availability is requested, materialize missing rows idempotently for that requested date before reading remaining capacity. Represent the two sunset locations as separate `TOUR` service records so the existing `TourRound.service_id` relationship records the selected location without adding a nullable location column.

Keep paid add-ons in `BookingService` and `ServiceUsage`. Add `ServiceUsage.start_time` so capacity is calculated per service/date/time, change fitness and sauna to per-person charge units, and serialize capacity checks by locking the `Service` row. The UI derives its maximum quantity from the booked room guest count and the server-reported remaining capacity.

## User Flow

1. Customer selects a card and an eligible booking room.
2. Customer selects a date, location when applicable, round time, and number of people.
3. The browser shows price per person, party size, and total; tours show `ฟรี`.
4. Confirmation sends one atomic request.
5. The server rechecks booking ownership/state, stay dates, guest limit, open round, and capacity inside a transaction.
6. Success updates the booking total only for fitness/sauna and shows the persisted reservation in the customer's booking detail.

## Non-goals

- Charging for any tour.
- A staff-editable recurring schedule; times are locked by the approved rules.
- Adding a global sauna capacity without a supplied business rule.
- Refactoring unrelated booking, payment, or employee modules.

## Approach Decision

The selected approach uses real database rounds and reservations rather than a frontend-only counter. Automatic schedule materialization was chosen over manual round entry because the approved schedule is locked and should always be available for testing. A frontend-only implementation was rejected because it cannot enforce shared capacity or support the FR → entity → table demonstration.

