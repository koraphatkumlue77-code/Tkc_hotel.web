# TKC Hotel

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
HTML, CSS, and vanilla JavaScript in the browser; Node.js on the server; MySQL for shared persistent data. The team chose a multipage frontend that calls server APIs. React, Tailwind, and TypeScript are outside the chosen learning stack.

## Users
Classmates can use the customer website and exercise the hotel workflows. Staff roles in the requirements are Superadmin, reception, accounting, management, and housekeeping.

## Product Purpose
Build a working hotel website and database system for a Web Development and Database course. Users should be able to exercise every requirement in the authoritative requirements document while learning the fundamentals of the web stack and relational data.

## Operating Context
TKC Hotel is fictional. The website and MySQL-backed workflows should work for multiple people using it from different locations. Payment-related services are simulated and must not charge real money. Users may enter fictional identity numbers for the booking fields required by the specification. Hosting decisions are deferred.

## Capabilities and Constraints
- The authoritative requirements are in `docs/reference/TKC_Requirements_Business_Rules_TH.docx`. The PDF and Figma prototype are supporting references when they do not conflict with that document.
- All requirements are in scope, including room inventory, date-based availability, multitype bookings, role-based work, payment simulation and review, services, tours, refunds, housekeeping, chat, reviews, and audit history.
- The existing `index.html`, `style.css`, and `script.js` are a functional prototype. The team authorized reorganizing files and replacing the visual design for maintainability.
- The customer and staff interfaces must show shared, persisted state rather than isolated browser-only samples.

## Brand Commitments
Use blue as the primary color and white as the secondary color. The selected Blue Harbor layout uses the coral orange accent from the Clear Booking mockup instead of gold. The customer frontend should feel advanced, carefully art-directed, and premium while staying in plain HTML, CSS, and JavaScript.

## Evidence on Hand
- Existing frontend prototype: `index.html`, `style.css`, `script.js`.
- Requirements: `docs/reference/TKC_Requirements_Business_Rules_TH.docx`.
- Supporting presentation: `../docs/TKC wekes hotel.pdf`.
- Supporting Figma flow reference: https://www.figma.com/design/i4g6ghZqkT92dG2jPTeKUR/

## Product Principles
- Teach the boundary between browser, server, and database through clear, separate modules.
- Apply booking, pricing, permission, and audit rules on the server so simultaneous users see consistent results.
- Preserve the feature intent shown in the current prototype and Figma while improving information structure and visual clarity.
- Keep every money movement visibly simulated.
