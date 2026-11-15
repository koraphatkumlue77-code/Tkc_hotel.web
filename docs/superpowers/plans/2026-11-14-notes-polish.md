# TKC interface integration and polish

**Goal:** Apply `../../../../docs/note_2_edit.txt` and the user's supplied resort and palm logo to the real Express application.

**Architecture:** Keep HTML, CSS and native JavaScript modules. `public/` is the single frontend source of truth. Root prototype entry files become compatibility entries rather than a second application. Preserve MySQL APIs and server authority for prices, permissions, inventory and payments.

**Design:** Premium Thai resort, navy primary, white secondary, orange `#EB8317` accent. Distinct room photographs, readable animated hero with pause/reduced motion, seasonal photo selectors, accessible booking and detail dialogs. Customer destinations are home and account; staff retain role workspaces.

**Approach:** Integrate existing production functionality rather than rebuild with a framework or maintain duplicate prototypes. The user authorized execution and skill choice, then replaced logo A with `logo_tkc.png` and required local picture assets.

## Tasks

- [x] Home and compatibility: consolidated CSS into `public/style.css`, controller into `public/script.js`; root index provides a server-start entry. Unified login, visible logout, account links, section tracking, reservation indicators, facility details, revised booking status confirmation and quote freshness.
- [x] Account: polished `public/account.html`, `public/js/account.js`, account-specific styling. Home links open booking dialogs; preserved transaction functions, lifecycle, payment feedback, and brand.
- [x] Staff: polished staff workspace layout and controls, preserved role behavior, and used one sign-in entry.
- [x] Shared brand: supplied logo and favicon, orange tokens, independent local room/season images, updated documentation and retired duplicate prototype behavior.
- [x] Verification: 20 automated tests passed; browser checks cover unified login, role routing, quote concurrency, held booking, payment review/approval, failure recovery, profile return URLs, facility dialogs, section navigation, 375px/desktop layouts, all five roles, keyboard dismissal and reduced motion. One Impeccable detector pass completed; actionable warnings addressed, structural spacing false positives checked in screenshots.

## Review focus

- A failed payment after holding inventory must not create a duplicate booking on retry.
- A stale quote must never overwrite the latest dates or permit submission while recalculating.
- Closed dialogs must not discard a hold without a path to account recovery.
- Reservation indicators exclude cancelled/expired bookings and never treat unapproved payments as paid.
- Mobile navigation, long Thai names and dialogs must fit without horizontal overflow.

## Execution record

Plan prepared before UI changes. Independent account and staff tasks can run in parallel under Superpowers dispatching-parallel-agents; main agent owns home, brand integration and final verification. No automatic commits or publication.
