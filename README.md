# TKC Hotel Web and API

โปรเจกต์ TKC Hotel ประกอบด้วยหน้าเว็บโรงแรมและ Express API ที่เชื่อมต่อ MySQL ฐานข้อมูล `tkc_hotel_dev`

## โครงสร้างโปรเจกต์

```text
Tkc_hotel.web/
├── index.html
├── script.js
├── style.css
└── api/
    ├── app.js
    ├── db.js
    ├── server.js
    ├── package.json
    ├── .env.example
    └── test/
```

## สิ่งที่ต้องติดตั้ง

- Node.js 20 ขึ้นไป
- MySQL Server
- MySQL Workbench หรือ MySQL command-line client
- Visual Studio Code

ตรวจสอบ Node.js และ npm:

```bash
node --version
npm --version
```

## 1. เตรียมฐานข้อมูล MySQL

เปิด MySQL Workbench และตรวจว่ามีฐานข้อมูล `tkc_hotel_dev` แล้ว จากนั้นสร้างผู้ใช้เฉพาะสำหรับ API โดยเปลี่ยน `YOUR_STRONG_PASSWORD` เป็นรหัสผ่านที่คาดเดายาก:

```sql
CREATE USER IF NOT EXISTS 'tkc_api'@'127.0.0.1'
IDENTIFIED BY 'YOUR_STRONG_PASSWORD';

ALTER USER 'tkc_api'@'127.0.0.1'
IDENTIFIED BY 'YOUR_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE
ON tkc_hotel_dev.*
TO 'tkc_api'@'127.0.0.1';

FLUSH PRIVILEGES;
```

บัญชี `tkc_api` ไม่มีสิทธิ์สร้าง แก้โครงสร้าง หรือลบตาราง การรัน migration ให้ใช้บัญชีผู้ดูแลฐานข้อมูลแยกต่างหาก

## 2. ติดตั้ง API

เปิด Terminal ใน VS Code แล้วรัน:

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm install
```

## 3. ตั้งค่า Environment

สร้างไฟล์ `.env` จากตัวอย่าง:

```bash
cp .env.example .env
```

เปิด `api/.env` แล้วใส่ค่าจริง:

```dotenv
PORT=3000
AUTH_SECRET=สร้างค่าสุ่มอย่างน้อย_32_ตัวอักษร
AUTH_TOKEN_TTL_SECONDS=3600
AUTH_COOKIE_SECURE=false
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tkc_api
DB_PASSWORD=YOUR_STRONG_PASSWORD
DB_NAME=tkc_hotel_dev
DB_CONNECTION_LIMIT=10
```

ค่า `DB_PASSWORD` ต้องตรงกับรหัสผ่านที่ใช้ในคำสั่ง `CREATE USER` และห้าม commit ไฟล์ `.env` เข้า Git

สร้าง `AUTH_SECRET` สำหรับเครื่อง local ได้ด้วย `openssl rand -hex 32` และนำผลลัพธ์ไปใส่ใน `.env`
ห้ามใช้ค่า secret ตัวอย่างเมื่อ deploy จริง ส่วน `AUTH_COOKIE_SECURE` ใช้ `false` เฉพาะ local HTTP
และต้องเปลี่ยนเป็น `true` เมื่อใช้งานผ่าน HTTPS

## 4. สำรองและตรวจฐานข้อมูล

สร้าง backup ของ `tkc_hotel_dev` ก่อน migration:

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm run db:backup
```

ตรวจ legacy data แบบ read-only ก่อน Plan B:

```bash
npm run db:preflight
```

ฐานข้อมูลเครื่องนี้ migrate Plan B ครบแล้ว ดูหลักฐานและ backup hash ได้ที่
`database/migration-record.md` ส่วน schema หลัง migration อยู่ที่
`database/schema.sql`

## 5. เตรียมฐานข้อมูลสำหรับ Integration Tests

สร้าง `api/.env.test` จาก `.env.test.example` โดยใช้ฐานข้อมูลที่ชื่อลงท้าย
`_test` เท่านั้น เช่น `tkc_hotel_test` แล้ว reset ได้ด้วย:

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm run db:test:reset
```

คำสั่งมี guard ป้องกันการ reset ฐานข้อมูลที่ชื่อไม่ลงท้าย `_test` ผลที่ถูกต้องคือ
19 ตาราง, 4 ประเภทห้อง, 800 ห้อง และ 5 บริการ

## 6. รันเว็บไซต์และ API ระหว่างพัฒนา

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm run dev
```

## Phase 6: การจัดห้องและการเข้าพัก

API ที่พร้อมใช้งานแล้ว:

- `POST /api/staff/bookings/:bookingId/assignments` จัดหรือเปลี่ยนห้องจริง
- `POST /api/staff/bookings/:bookingId/check-in` Check-in
- `POST /api/staff/bookings/:bookingId/no-show` บันทึก No-show
- `POST /api/staff/bookings/:bookingId/emergency-moves` ขออนุมัติย้ายห้องฉุกเฉิน
- `POST /api/management/emergency-moves/:assignmentId/approve` อนุมัติย้ายห้อง
- `POST /api/management/emergency-moves/:assignmentId/reject` ปฏิเสธย้ายห้อง
- `POST /api/staff/bookings/:bookingId/check-out` Check-out และส่งงานทำความสะอาด

Check-out จะไม่ผ่านถ้ายังมียอดค้าง และทุก mutation จะบันทึกลง MySQL พร้อม Audit/RoomEvent
ภายใน transaction เดียว ทดสอบทั้งหมดกับฐาน `tkc_hotel_test` ด้วย `npm run test:db`

## Phase 7: บริการ โปรโมชั่น ทัวร์ และคืนเงิน

กลุ่ม API สำคัญ:

- `GET /api/services` และ `GET /api/attractions`
- `POST /api/bookings/:bookingId/services` และเส้นทางยกเลิก service
- `POST /api/staff/bookings/:bookingId/services` สำหรับบริการหลัง Check-in พร้อมรับเงิน
- `GET/POST/PATCH /api/staff/promotions`
- `GET /api/tours/rounds`, `POST/PATCH /api/staff/tours/rounds` และเส้นทางผู้ร่วมทัวร์
- `POST /api/accounting/payments/:paymentId/refund-requests`
- `GET /api/management/refunds` และเส้นทาง approve/reject/payout

จำนวนที่นั่งทัวร์และวงเงินคืนใช้ row lock ใน transaction ส่วนการจ่ายคืนสร้าง Payment ฝั่ง `OUT`
แยกจาก Payment รับเงินเดิมเสมอ หน้า Facilities และหน้าพนักงานใช้ API เหล่านี้แล้ว

## Phase 8: แม่บ้าน ความเสียหาย และปิดซ่อม

- `GET /api/housekeeping/cleaning` และเส้นทาง `start`/`complete`
- `POST /api/housekeeping/rooms/:roomId/damages` ใช้ multipart field `photo`
- `GET /api/room-events/:eventId/photo` ต้องมี session พนักงาน
- `GET /api/management/damages` และเส้นทาง `review`/`resolve`
- `POST /api/management/rooms/:roomId/closures` และเส้นทาง `reopen`
- `GET /api/staff/rooms/:roomId/history`

รูปความเสียหายเก็บใต้ `api/storage/damages/` แบบ private และห้ามเปิดผ่าน static URL
การปิด/เปิดห้องต้องส่ง `expectedVersion`; ถ้าข้อมูลถูกแก้จากคำขออื่น API จะตอบ 409

## Phase 9: รีวิว แชต พนักงาน และ Audit

- `GET /api/reviews`, `POST /api/bookings/:bookingId/reviews`, และ Superadmin hide
- `GET/POST /api/chat/messages` สำหรับลูกค้า
- `GET /api/reception/chats` และเส้นทางอ่าน/ตอบของ Reception
- `GET/POST/PATCH /api/staff/employees`
- `GET /api/management/audit`

ลูกค้ารีวิวได้เมื่อ Check-out แล้วและหนึ่งใบจองมีหนึ่งรีวิว รหัสผ่านพนักงาน hash ด้วย bcrypt
และไม่ถูกส่งกลับหรือบันทึกใน Audit หน้าแชตใช้ polling ทุก 5 วินาทีเมื่อเปิดอยู่

## Phase 10: หน้าเว็บเชื่อม API ครบ

หน้าเว็บใช้ same-origin `/api/*` และ MySQL เป็นแหล่งข้อมูลธุรกิจเพียงแหล่งเดียวแล้ว ไม่มีรหัสผ่าน
ตัวอย่าง รายการจองจำลอง รายชื่อพนักงานจำลอง แผนที่สถานะห้องใน memory หรือรายงานความเสียหาย
จำลอง การรีเฟรชหน้าเว็บจะกู้ session ด้วย `GET /api/auth/me`

ในรายละเอียดใบจอง พนักงานต้อนรับและ Super Admin สามารถจัดห้องที่ชนิดตรงกัน แล้วกด
Check-in, No-show หรือ Check-out ได้จากข้อมูลจริง หาก Check-out ยังมียอดค้าง API จะปฏิเสธ
และแสดงยอดที่ต้องรับเพิ่ม

## Phase 11: ตรวจระบบก่อนใช้งาน local

รันจากโฟลเดอร์ `api`:

```bash
npm run db:test:reset
npm test
npm run test:db
npm audit --omit=dev
npm run db:preflight
```

`db:test:reset` แตะเฉพาะฐานที่ลงท้าย `_test`; ห้ามตั้ง `DB_NAME` ใน `.env.test` เป็นฐาน dev
หรือ production ชุดทดสอบ MySQL ทำงานแบบลำดับเดียวเพราะใช้ฐานทดสอบร่วมกัน ส่วน
`db:preflight` เป็นการตรวจฐาน dev แบบ read-only และยืนยันว่า migration contract ครบ

ตรวจระบบที่กำลังรัน:

```bash
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/health/db
```

ควรได้ HTTP 200 ทั้งสองเส้น จากนั้นเปิด `http://localhost:3000/` แล้วทดสอบ สมัครสมาชิก →
จอง → อัปโหลดหลักฐาน → บัญชีอนุมัติ → ต้อนรับจัดห้อง/Check-in/รับยอดคงเหลือ/Check-out →
แม่บ้านเริ่มและปิดงานทำความสะอาด ข้อมูลทุกขั้นต้องยังอยู่หลังรีเฟรช

เมื่อสำเร็จจะแสดง:

```text
TKC Hotel web and API running at http://localhost:3000
```

หยุด API ด้วย `Control + C`

หน้าเว็บหลักเปิดที่ `http://localhost:3000/` โดย Express process เดียวกันเป็นผู้เสิร์ฟ
`index.html`, `style.css`, `script.js` และ `/api/*`

### พื้นที่เก็บหลักฐานการชำระเงิน

หลักฐานถูกเก็บแบบ private ใต้ `api/storage/payments/` และไม่มีการเปิดโฟลเดอร์นี้ผ่าน
static web server ฐานข้อมูลเก็บเฉพาะ relative reference ที่สร้างโดย server เท่านั้น โฟลเดอร์
`api/storage/` ถูก ignore จาก Git และสามารถกำหนดตำแหน่งใหม่ด้วย `PAYMENT_STORAGE_ROOT`

- รองรับ JPEG, PNG และ WebP เท่านั้น
- ขนาดสูงสุด 5 MiB
- ระบบตรวจทั้ง MIME type และ magic bytes
- ต้องเข้าสู่ระบบจึงเปิดดูไฟล์ได้ และ response ใช้ `Cache-Control: no-store`
- ห้ามย้ายพื้นที่เก็บเข้าโฟลเดอร์ public หรือ commit ไฟล์หลักฐาน

### ขั้นตอนทดสอบระบบชำระเงินบน local

1. เข้าระบบเป็นลูกค้า สร้างรายการจอง แล้วเปิด “รายการจองของฉัน”
2. แนบหลักฐานผ่านรายการที่มีสถานะ `PENDING_PAYMENT`; รายการจะเปลี่ยนเป็น `PAYMENT_REVIEW`
3. เข้าระบบเป็นพนักงานบัญชี เปิดธุรกรรมรอตรวจ แล้วอนุมัติหรือปฏิเสธพร้อมเหตุผล
4. ถ้าปฏิเสธ ลูกค้าส่งหลักฐานใหม่ได้ภายใน hold 30 นาที โดยประวัติเดิมไม่ถูกแก้ทับ
5. พนักงานต้อนรับบันทึกรับยอดคงเหลือจากแดชบอร์ด และบัญชี/บริหารดูสรุปยอดของวันได้
6. รีเฟรชหน้าเพื่อยืนยันว่าสถานะและยอดยังอยู่ใน MySQL

เส้น API หลักของ Phase 5:

```text
POST /api/bookings/:bookingId/payment-proof
POST /api/bookings/:bookingId/payment-proof/resubmit
GET  /api/accounting/payments
GET  /api/accounting/payments/:paymentId
GET  /api/payments/:paymentId/proof
POST /api/accounting/payments/:paymentId/approve
POST /api/accounting/payments/:paymentId/reject
POST /api/staff/bookings/:bookingId/payments
GET  /api/accounting/financial-summary
```

ทุกคำสั่งสร้าง Payment ต้องใช้ idempotency key; การส่งซ้ำด้วย key และข้อมูลเดิมจะคืนรายการเดิม
โดยไม่บันทึกเงินหรือไฟล์ซ้ำ

## 7. ตรวจสอบ API

### ตรวจว่า API Server ทำงาน

เปิดเบราว์เซอร์ที่:

```text
http://localhost:3000/api/health
```

หรือรัน:

```bash
curl http://localhost:3000/api/health
```

ผลลัพธ์ที่คาดหวัง:

```json
{
  "status": "ok",
  "service": "tkc-hotel-api"
}
```

Endpoint นี้ไม่ตรวจฐานข้อมูล จึงควรยังทำงานแม้ MySQL หยุดทำงาน

### ตรวจการเชื่อมต่อ MySQL

เปิดเบราว์เซอร์ที่:

```text
http://localhost:3000/api/health/db
```

หรือรัน:

```bash
curl http://localhost:3000/api/health/db
```

เมื่อเชื่อม MySQL สำเร็จ:

```json
{
  "status": "ok",
  "database": "connected"
}
```

### ระบบสมาชิกและพนักงาน

Authentication API ที่พร้อมใช้งาน:

- `POST /api/auth/register` สมัครลูกค้าและสร้าง session cookie
- `POST /api/auth/login` เข้าสู่ระบบ โดยส่ง `account_type` เป็น `customer` หรือ `employee`
- `GET /api/auth/me` โหลดผู้ใช้ปัจจุบันจากฐานข้อมูลใหม่ทุกครั้ง
- `POST /api/auth/logout` ล้าง session cookie

ฟอร์มสมัครสมาชิกและล็อกอินใน `index.html` เรียก API เหล่านี้แล้ว และกู้คืน session
อัตโนมัติด้วย `/api/auth/me` เมื่อรีเฟรชหน้าเว็บ

### ห้องพักและการค้นหาห้องว่าง

- `GET /api/room-types` แสดงประเภทห้องและราคาจาก MySQL
- `GET /api/rooms/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=2`
  ตรวจจำนวนห้องว่างจริงตามช่วงวันที่
- `GET /api/staff/rooms` รายการห้องสำหรับพนักงานที่ล็อกอิน
- `PATCH /api/staff/rooms/:roomId/status` เปลี่ยนสถานะด้วย `expectedVersion`
- `POST/PATCH /api/staff/room-types` จัดการประเภทห้องสำหรับ superadmin
- `POST/PATCH /api/staff/rooms` จัดการข้อมูลห้องสำหรับ superadmin

หน้า Search และฟอร์มจองบนเว็บไซต์เรียก API จริงแล้ว ราคา ยอดมัดจำ และเวลาหมด hold
คำนวณโดย server และบันทึกลง MySQL ไม่เชื่อยอดที่คำนวณจาก browser

### การจองของลูกค้า

- `POST /api/bookings` สร้างใบจองออนไลน์และกันห้อง 15 นาที
- `GET /api/bookings/mine?page=1&limit=20` ดูรายการของลูกค้าที่ล็อกอิน
- `GET /api/bookings/:bookingId` ดูห้อง บริการ โปรโมชัน ยอดชำระ และ timeline ของตนเอง
- `POST /api/bookings/:bookingId/cancel` ยกเลิก booking ที่ยังยกเลิกได้
- `POST /api/bookings/:bookingId/late-arrival` แจ้งเวลามาถึงช้าสำหรับ booking ที่ยืนยันแล้ว

ตัวอย่างสร้าง booking หลังสมัคร/ล็อกอินและเก็บ cookie ใน `cookies.txt`:

```bash
curl -i -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"checkIn":"2037-06-10","checkOut":"2037-06-12","rooms":[{"roomTypeId":1,"guestCount":2}],"breakfastDates":["2037-06-11"],"promotionCodes":[],"paymentChoice":"deposit"}' \
  http://localhost:3000/api/bookings
```

การสร้าง booking ล็อกประเภทห้องใน transaction, ตรวจ inventory ซ้ำใน MySQL,
snapshot ราคา และป้องกันคำขอพร้อมกันแย่งห้องสุดท้าย

### การจองสำหรับพนักงาน

- `POST /api/staff/bookings/walk-in` สร้าง walk-in วันปัจจุบันสำหรับ reception/superadmin
- `GET /api/staff/bookings` ดูรายการแบบแบ่งหน้าและกรอง `channel`/`status`
- `GET /api/staff/bookings/:bookingId` ดูลูกค้า ห้อง และห้องจริงที่ผูกไว้

Staff views อนุญาตเฉพาะ reception, accounting, superadmin และ management;
housekeeping ไม่มีสิทธิ์อ่านข้อมูล booking

ตัวอย่างสมัครลูกค้า:

```bash
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"full_name":"Test Guest","email":"guest@example.com","phone":"0812345678","identity_type":"PASSPORT","identity_number":"AA123456","password":"CustomerPass123!"}' \
  http://localhost:3000/api/auth/register
```

ตัวอย่างตรวจ session:

```bash
curl -i -b cookies.txt http://localhost:3000/api/auth/me
```

Cookie เป็น `HttpOnly` และ `SameSite=Strict`; API จะตรวจสถานะ active/suspended และสิทธิ์พนักงาน
จาก MySQL ทุก protected request โดยไม่ส่ง password hash กลับไปยัง browser

เมื่อ MySQL หยุดทำงาน รหัสผ่านผิด หรือค่าการเชื่อมต่อไม่ถูกต้อง API จะตอบ HTTP `503`:

```json
{
  "status": "error",
  "database": "unavailable"
}
```

## 8. รัน Automated Tests

Unit tests ไม่แก้ไข `tkc_hotel_dev` ส่วน integration tests ใช้และ reset เฉพาะ
`tkc_hotel_test` ที่แยกไว้เท่านั้น:

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm test
npm run test:db
```

ก่อนเริ่มงาน integration ที่ต้องการฐานข้อมูลสะอาด ให้รัน `npm run db:test:reset`

## 9. รันแบบปกติ

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm start
```

## 10. เปิดหน้าเว็บไซต์

เปิดเบราว์เซอร์ที่:

```text
http://localhost:3000/
```

ไม่ต้องใช้ Live Server และไม่ควรเปิด `index.html` ด้วย `file://` เพราะหน้าเว็บและ API
ใช้ origin เดียวกันที่พอร์ต 3000

## คำสั่งตรวจสอบเร็ว

```bash
cd /Users/korraphatmac/Tkc_hotel.web/api
npm test
npm run test:db
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/health/db
```

`npm run test:db` ใช้และ reset เฉพาะ `tkc_hotel_test` เพื่อทดสอบ legacy
preflight, Plan B migration และ deterministic seed กับ MySQL จริง

## แก้ปัญหาเบื้องต้น

### Missing required database configuration

ตรวจว่ามีไฟล์ `api/.env` และกำหนด `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` ครบ

### Access denied for user

ตรวจว่า `DB_USER`, `DB_PASSWORD` และ host ใน `.env` ตรงกับบัญชีที่สร้างใน MySQL

### Database health ตอบ 503

ตรวจว่า MySQL Server อยู่ในสถานะ Running, พอร์ตเป็น `3306` และมีฐานข้อมูล `tkc_hotel_dev`

### Port 3000 ถูกใช้งาน

เปลี่ยน `PORT` ใน `.env` เช่น:

```dotenv
PORT=3001
```
