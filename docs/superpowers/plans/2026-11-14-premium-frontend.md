# TKC Premium Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทนหน้าเว็บทดลองด้วย frontend HTML/CSS/JavaScript ที่ดูพรีเมียม ใช้งานได้จริง และเชื่อมครบทุก API

**Architecture:** หน้า HTML แยกตามงาน ใช้ ES modules เรียก API ผ่าน `public/js/api.js` และแสดงผลด้วย DOM API หน้า public มีภาพและลำดับการตัดสินใจจองที่ชัด; staff ใช้ shell เดียวกันแต่เน้นตาราง งานค้าง และสถานะจาก MySQL

**Tech Stack:** HTML5, CSS custom properties/Grid/Flexbox, vanilla JavaScript ES modules, browser Fetch API, Node/Express/MySQL จากสองแผนก่อน, Playwright เฉพาะการทดสอบ E2E

**Spec:** `docs/superpowers/specs/2026-11-14-tkc-hotel-web-system-design.md`, `PRODUCT.md`, `docs/reference/TKC_Requirements_Business_Rules_TH.docx`

## Global Constraints

- เลือก Blue Harbor: น้ำเงินเข้มเป็นหลัก ขาวเป็นพื้นผิว และส้มปะการังเป็นสีเน้น; ไม่มีทองอ่อน
- หน้า public ต้องดู advanced และประณีต; หน้าพนักงานต้องอ่านงานและสถานะได้เร็ว
- 21st.dev ใช้เป็น visual/interaction reference เท่านั้น ไม่คัดลอก React/TypeScript/Tailwind code เข้ามา
- มีภาพโรงแรมและห้องที่ตรวจสิทธิ์ใช้และ URL ได้; ข้อมูลโรงแรมเป็นข้อมูลจำลองและต้องระบุให้เข้าใจ
- รองรับจอ 390px ถึง desktop, keyboard, focus, labels, empty/loading/error states, `prefers-reduced-motion`
- ข้อมูลทุกหน้าจอมาจาก API/MySQL; เงินเป็นสถานะจำลองที่บอกชัด ไม่มีการตัดเงินจริง

## Review Focus

1. ผู้ใช้กดจองซ้ำขณะ request ช้า: UI ต้องไม่สร้างสองใบจอง — Task 3
2. หน้าผลค้นหาว่างหรือ API ล้มเหลว: แสดงวิธีแก้/ลองใหม่ ไม่เป็นหน้าขาว — Task 2
3. มือถือ 390px: แถบค้นหา ฟอร์ม ราคา และตารางต้องไม่ล้นแนวนอน — Tasks 2, 3, 4, 6
4. ผู้ใช้สลับบทบาทหรือ session หมดอายุ: เมนู/ข้อมูลเดิมไม่ค้างให้เห็นและ API ยังปฏิเสธ — Task 4
5. ผู้ใช้ลดการเคลื่อนไหว: motion ไม่บังคับเล่นและเนื้อหายังเห็นครบ — Tasks 1, 6

## File Map

- `public/index.html`, `public/rooms.html`, `public/booking.html`, `public/account.html`: หน้า public/member
- `public/staff/*.html`: หน้าของ Superadmin, reception, accounting, management, housekeeping
- `public/css/tokens.css`, `public/css/public.css`, `public/css/staff.css`: สี/ตัวอักษร/ระยะ, หน้าโรงแรม, หน้า staff
- `public/js/api.js`, `public/js/ui.js`, `public/js/rooms.js`, `public/js/booking.js`, `public/js/account.js`, `public/js/staff/*.js`: API client และ interaction รายหน้า
- `public/assets/`: ภาพและฟอนต์ที่ใช้จริง พร้อมบันทึกแหล่งที่มา
- `test/e2e/*.spec.js`: เส้นทางใช้งานจริงหลายบทบาท
- `DESIGN.md`, `.impeccable/design.json`: บันทึกระบบภาพเมื่อผ่านการตรวจงานออกแบบ

## Tasks

### Task 1: Premium visual system and shared page shell

**Files:** Create `public/css/tokens.css`, `public/css/public.css`, `public/css/staff.css`, `public/js/api.js`, `public/js/ui.js`, `public/assets/README.md`, `playwright.config.js`; modify `server/app.js`, `package.json`; retain old files until replacement pages pass.

**Interfaces:** `api(path, {method='GET', body}={}) -> Promise<unknown>` handles JSON, 401 and errors; `renderStatus(target, {kind, message, retry})`; CSS tokens `--navy`, `--surface`, `--coral`, `--text`, `--focus`.

- [ ] Write `test('shell semantics')`: `await expect(page.getByRole('button', {name:'ค้นหาห้อง'})).toBeVisible()`; Tab reaches each search input; an injected 401 shows an on-page sign-in state.
- [ ] Run the test; expect failure because the shell and API client do not exist.
- [ ] Apply Impeccable and Taste to a coherent Blue Harbor design: refined type hierarchy, verified imagery, restrained coral CTA, purposeful transition and accessible focus; use Ponytail to keep JS/CSS modules small. Do not import a frontend framework.
- [ ] Inspect one desktop and one mobile capture, fix material shell defects, then rerun smoke test; expect pass.
- [ ] Commit `feat: establish premium TKC frontend system`.

### Task 2: Public discovery and date-based room search

**Files:** Create `public/index.html`, `public/rooms.html`, `public/js/rooms.js`, `test/e2e/search.spec.js`; modify `public/css/public.css`, `server/app.js`.

**Interfaces:** Search form sends `GET /api/rooms/availability?checkIn&checkOut&guests`; room details and filters use returned inventory and prices; navigation goes to `booking.html` with dates and selected type in URL.

- [ ] Write `test('room search states')`: `await expect(page.getByText('Standard Room')).toBeVisible()`; invalid dates show an inline error, zero results show an empty state, network failure shows retry, and `scrollWidth <= innerWidth` at 390px.
- [ ] Run `npx playwright test test/e2e/search.spec.js`; expect failure.
- [ ] Build premium homepage, responsive search bar, room results/detail, facilities, reviews preview and contact entry; use real data or clearly marked seed content and avoid rendering all 800 rooms.
- [ ] Run search E2E and inspect desktop/mobile screenshots; expect pass and no overflow.
- [ ] Commit `feat: build hotel discovery and room search`.

### Task 3: Member booking, account, and mock payment flow

**Files:** Create `public/booking.html`, `public/account.html`, `public/js/booking.js`, `public/js/account.js`, `test/e2e/booking.spec.js`; modify `public/css/public.css`.

**Interfaces:** Booking flow calls quote, hold, services/tours, and mock payment endpoints from earlier plans; account calls `GET /api/bookings/mine` and booking detail/status endpoints.

- [ ] Write `test('member booking journey')`: after selecting Standard + Family and two breakfast dates, `await expect(total).toHaveText('฿12,700')`, deposit shows `฿5,080`, double click leaves one booking, mock payment shows pending review, and reload preserves the booking.
- [ ] Run `npx playwright test test/e2e/booking.spec.js`; expect failure.
- [ ] Build step-by-step booking pages with persistent summary, clear price breakdown, upload/demo payment states, account history, late arrival, cancellation, payment-overdue escalation and replacement-room decision; use disabled/loading buttons during mutation and accessible inline errors.
- [ ] Run booking E2E at desktop/mobile and keyboard-only pass; expect pass.
- [ ] Commit `feat: connect premium booking and member account`.

### Task 4: Staff shell and all role workflows

**Files:** Create `public/staff/index.html`, `public/staff/superadmin.html`, `public/staff/reception.html`, `public/staff/accounting.html`, `public/staff/management.html`, `public/staff/housekeeping.html`, `public/js/staff/common.js`, role-specific JS files, `test/e2e/staff.spec.js`; modify `public/css/staff.css`.

**Interfaces:** `loadStaffPage(allowedRole, render) -> Promise<void>`; every role view calls its protected APIs, and `public/js/api.js` clears UI on 401/403.

- [ ] Write `test('staff role journey')`: wrong-role page has no protected data; accounting approval changes status to confirmed, Superadmin assignment sets a room, reception checkout creates one cleaning task, housekeeping completion sets ready, and management audit includes each actor.
- [ ] Run `npx playwright test test/e2e/staff.spec.js`; expect failure.
- [ ] Build one staff shell and focused role pages with task queues, filters, pagination, status text and confirmation dialogs; include Superadmin payment escalations and replacement proposals; bind forms to API, never hardcode totals or credentials.
- [ ] Run staff E2E and inspect 1440px/390px captures; expect pass.
- [ ] Commit `feat: connect role-based hotel workspaces`.

### Task 5: Communication, content, and final acceptance

**Files:** Create `public/js/chat.js`, `public/js/reviews.js`, `test/e2e/full-flow.spec.js`, `docs/requirements-coverage.md`; modify applicable public/staff pages, `README.md`, `public/css/*.css`.

**Interfaces:** Chat polls `GET /api/chats/:threadId/messages` while open; review and attraction forms use their protected APIs; requirements coverage maps every REQ/UR/BR to route, UI and test.

- [ ] Write `test('end-to-end hotel lifecycle')`: follow customer → mock pay → accountant approval → room assignment → check-in → review → checkout → cleaning and assert each persisted state after reload; send one member/reception chat exchange and assert both views show it.
- [ ] Run full E2E; expect failure until remaining UI is connected.
- [ ] Connect chat, reviews, attractions, audit history, damage and repair UI; remove old demo-only pages after feature parity. Update README with local setup and simulated-payment warning.
- [ ] Run `npm test` and `npx playwright test`; inspect desktop/mobile plus reduced-motion screenshots; run Impeccable detector/reviewer and Ponytail code review; resolve material findings in a bounded pass.
- [ ] Commit `feat: complete TKC customer and staff journeys`.

## Handoff

After these tasks, review `docs/requirements-coverage.md` against every rule in the DOCX. Hosting and public URL are discussed only after the locally verified system works.
