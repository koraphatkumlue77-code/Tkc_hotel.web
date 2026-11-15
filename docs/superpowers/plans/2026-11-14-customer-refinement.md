# Customer interface refinement

User-directed refinement of the delivered homepage and profile. Preserve server workflows and the staff interfaces, which the user has not reviewed yet.

- Align language control with header actions by removing inherited label margins.
- Use the supplied logo with transparent background, preserving its artwork.
- Replace the animated still with a locally stored Full HD looping video. No visible playback controls; use a poster under reduced motion or playback failure.
- Separate white room cards from their section background and use orange `#EB8317` for room type titles, search and highlights. The user's final adjustment removes the orange price box and keeps prices as plain text.
- Download one consistent Lucide icon set into assets. Standardize typography to Noto Sans Thai and Noto Serif Thai.
- Upgrade profile with real booking search/filter actions, clearer status/action hierarchy, compact controls and initially closed floating chat.
- Provide ten seasonal example destinations with distinct local photography. Show descriptions only in the expanded item; support selection buttons and keyboard operation.
- Use red for danger/rejected/cancel actions, green for approved/confirmed success, amber for pending review. Status always includes text.
- Verify desktop/mobile alignment, all media dimensions/loading, gallery expansion, profile search/filters/chat, booking recovery, typography and existing API tests. Inspect in one batched round, fix defects, then confirm once.

Main agent owns homepage, assets, shared typography and verification. Profile agent owns only account HTML, controller and stylesheet. No framework or new runtime dependency is needed.

## Verification

- `npm test`: 21 passed, including a real member API check for persisted hold deadlines used by profile expiration filters.
- `node test/profile-controller.check.mjs`: passed search, filters, expired holds, empty results, pending payment guards, initially closed chat, open-only polling, stale response handling, send failure, Escape/focus return and session expiry.
- `test/home-ui.browser.js`: 21 browser checks passed, including Full HD dimensions, silent looping playback with no controls, header alignment, ten destinations with one expanded description, empty-season navigation reset, local images, responsive navigation and reduced-motion fallback.
- Profile browser checks passed for search/reset/status filters, mobile floating chat, mocked message submission, Escape after sending and focus return. No test messages were sent to reception.
- Logo transparency was verified by reading the SVG render's alpha channel: transparent corners and retained opaque linework. Only two font families were observed on customer text and controls.
- Independent review identified gallery empty-state navigation and expired-hold classification; both were fixed and regression-checked.
- Desktop/mobile screenshots inspected in bounded passes. One Impeccable detector pass ran; spacing warnings were checked against actual containers, and the transparent video layer under reduced motion is intentional.
- Final requested room-card change verified in-browser: title color is `rgb(235, 131, 23)`, price background is transparent and price padding is zero.
