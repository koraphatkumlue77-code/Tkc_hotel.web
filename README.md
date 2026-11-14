# TKC Hotel

เว็บโรงแรมจำลองสำหรับวิชา Web Development and Database ใช้ HTML, CSS, JavaScript, Node.js/Express และ MySQL ข้อมูลการจอง สมาชิก ห้องพัก และงานพนักงานบันทึกลงฐานข้อมูลจริง การชำระและคืนเงินเป็น **การจำลองทั้งหมด** ไม่มีการตัดหรือโอนเงินจริง

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 24, npm และ Docker Desktop แล้วเปิด PowerShell ในโฟลเดอร์นี้:

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) ในเบราว์เซอร์ ข้อมูลจะคงอยู่ใน Docker volume ระหว่างการปิดและเปิดโปรแกรม การ seed ซ้ำจะไม่เพิ่มห้องหรือบัญชีพนักงานซ้ำ

ไฟล์ `index.html`, `style.css`, `script.js` ที่รากโครงการเป็นต้นแบบเดิมสำหรับเทียบงาน หน้าที่ใช้งานจริงอยู่ใน `public/` และต้องเปิดผ่าน Node server เพื่อเชื่อมต่อ MySQL

## บัญชีทดลอง

สมัครสมาชิกจากหน้าเว็บเพื่อทดสอบฝั่งลูกค้า บัญชีพนักงานที่สร้างโดย seed ใช้รหัสผ่านเริ่มต้น `TkcDemo2026!` (เปลี่ยนได้ด้วย `DEMO_STAFF_PASSWORD` ก่อน seed):

| บทบาท | อีเมล |
| --- | --- |
| Superadmin | `superadmin@tkc.local` |
| ฝ่ายต้อนรับ | `reception@tkc.local` |
| ฝ่ายบัญชี | `accounting@tkc.local` |
| ฝ่ายบริหาร | `management@tkc.local` |
| แม่บ้าน | `housekeeping@tkc.local` |

ใช้ข้อมูลลูกค้าและเอกสารตัวอย่างเท่านั้น เมื่อเผยแพร่ให้เพื่อนใช้จริง ให้เปลี่ยน `SESSION_SECRET`, รหัสผ่านฐานข้อมูล และรหัสผ่านพนักงานก่อน

## โครงสร้างหลัก

- `public/` หน้าเว็บและไฟล์ภาพ ฝั่งลูกค้าใช้รูปแบบจากต้นแบบเดิม
- `server/` Express API, สิทธิ์ตามบทบาท, กฎธุรกิจ และการทำรายการกับฐานข้อมูล
- `db/migrations/` โครงสร้าง MySQL; `db/seed.js` สร้างห้อง 800 ห้องและบัญชีตัวอย่าง
- `test/` ทดสอบกฎธุรกิจและ API ด้วยฐานข้อมูล `tkc_hotel_test` แยกจากข้อมูลที่ใช้ในเว็บ
- `docs/reference/` เอกสารข้อกำหนด DOCX; `docs/superpowers/` แบบออกแบบและแผน

## ทดสอบ

```powershell
npm test
```

คำสั่งทดสอบล้างเฉพาะฐานข้อมูล `tkc_hotel_test` เท่านั้น ห้ามนำฐานข้อมูลที่มีข้อมูลใช้งานจริงมาใช้เป็นฐานข้อมูลทดสอบ

จัดรูปแบบไฟล์หน้าเว็บและ JavaScript ด้วย `npm run format` โดยไฟล์ CSS ของต้นแบบเดิมถูกแยกไว้เพื่อให้เทียบงานได้ง่าย
