# TKC Hotel interface

The customer website uses a premium Thai resort identity with readable Thai typography, generous room photography, navy sections, and light booking surfaces. Staff screens use the same brand in a compact operational layout.

- Primary navy: `#082344` on the homepage; shared operational navy: `#102C48`.
- White and warm off-white provide secondary surfaces. Orange `#EB8317` is a restrained accent on navigation indicators, selected states, highlights, and the main search action. Use the requested 60/30/10 relationship as visual balance rather than a rigid pixel quota.
- The user-provided `assets/tkc-logo.png` is the primary logo source. `assets/tkc-mark.svg` removes its navy background with a native SVG color-key filter, preserving the original geometry. `assets/tkc-mark-navy.svg` provides the navy version for white surfaces; the favicon uses the same source on a navy tile.
- All design photographs are stored in `public/assets/`. These illustrate a fictional hotel; credits are recorded in `public/assets/README.md`. The interface does not hotlink remote pictures. Uploaded payment evidence remains separate from public design assets.
- Customer destinations are homepage and profile. Login, registration, booking and experience details use native dialogs. Staff workspaces are separated by role. Legacy room/booking URLs return to the homepage and preserve query selections.
- The hero uses a locally stored 1920×1080 muted, looping video without visible controls, as requested. Reduced motion uses a high-resolution still poster. Ten local seasonal image cards reveal descriptions only in the selected card, with previous/next controls.
- Typography uses two families only: Noto Sans Thai for body text and operational controls, and Noto Serif Thai for display headings. The same semantic roles retain the same family across customer pages.
- Profile provides booking search, status filters, contextual actions and expandable history. Reception chat is an initially closed floating panel on both customer pages. Red identifies danger/rejection/cancellation, green identifies confirmation/approval, and amber identifies waiting states; all statuses include text.
- Normal, hover, focused, disabled, loading, error and booked states remain distinct. Booking badges use both text and color. Payment submission is pending until accounting approves it; approved payments alone reduce the displayed balance.
- Canonical homepage sources are `public/index.html`, `public/script.js`, and `public/style.css`. Shared API and presentation helpers live in `public/js/`; shared tokens live in `public/css/tokens.css`. Root prototype files provide a server-start entry, not a second frontend implementation.
