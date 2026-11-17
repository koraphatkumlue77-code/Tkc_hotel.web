# Phase 10 — Frontend Integration Design

The browser must use the same-origin JSON API as its only source of hotel business state. Session restoration, booking history, room assignment, stay transitions, payments, services, housekeeping, chat, employees, reviews, refunds, promotions, and audit views must survive refresh because they are stored in MySQL.

Remove embedded credentials, sample bookings, local employee arrays, local room maps, local damage maps, and fake action buttons. Preserve only presentation constants such as role and status labels. Every asynchronous panel shows loading, empty, and error states. Reception and Super Admin can assign compatible available rooms and execute Check-in, No-show, and Check-out from a live booking record.

Acceptance: static tests reject the legacy demo stores and assert stay API wiring; existing unit and database suites remain green.
