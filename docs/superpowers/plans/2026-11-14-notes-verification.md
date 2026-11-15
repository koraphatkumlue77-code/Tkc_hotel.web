# Interface verification

- `npm test`: 20 passed, 0 failed against the separate test database.
- `test/home-ui.browser.js`: 15 public browser checks passed. Covers distinct local room images, all images loading, pool/market details, Escape dismissal, summer/rainy/winter content, mobile navigation, no horizontal overflow and reduced motion.
- Live browser flow: registration, login, unpaid hold, profile, payment submission, accounting approval, approved-only payment totals, main-page reservation indicators, logout, and safe profile return after login.
- Explicit failure checks: out-of-capacity guest counts remain unchanged and prevent submission; delayed older quotes do not replace newer totals; a known payment failure after creating a hold returns to that hold without creating a duplicate.
- Compatibility: old booking URLs preserve selected room and guest count. Root prototype entry shows server instructions without a redirect loop.
- Desktop and 375px checks: homepage, booking dialog, profile, trip booking dialog, and all five staff roles. Staff tables scroll inside their own regions. Numeric amounts retain their formatting.
- Trip details return through unified login to the profile and open a native booking dialog. Date-slot requests discard stale responses.
- Impeccable detector: one pass, warnings only. Addressed small text, accent border, and shadow warnings. Checked structural spacing warnings against desktop/mobile screenshots.
- Syntax, Prettier checks and `git diff --check` passed for changed sources.

Browser verification used a dedicated synthetic member and synthetic transactions in the local demonstration database. The unpaid failure-test hold was cancelled; the sample payment approval remains visible in the audit history. Existing user records were preserved.

The 21st reference page loaded. The linked Figma document timed out, so no claim of pixel matching that reference is made. The supplied notes and uploaded logo define the delivered design.

Screenshots and the detector report are in the git-ignored `artifacts/` folder. No dependencies were added, and no commits or deployment were performed.
