import {
  api,
  node,
  clear,
  section,
  metricGrid,
  table,
  form,
  note,
  baht,
  status,
  feedback,
} from "./common.js";
const roles = [
  ["superadmin", "ผู้ดูแลระบบ"],
  ["reception", "ฝ่ายต้อนรับ"],
  ["accounting", "ฝ่ายบัญชี"],
  ["management", "ฝ่ายบริหาร"],
  ["housekeeping", "แม่บ้าน"],
];
export async function render() {
  clear();
  const [overview, finance, promotions, refunds, staff, damage, audit] =
    await Promise.all([
      api("/api/reports/overview"),
      api("/api/reports/financial"),
      api("/api/promotions"),
      api("/api/refunds"),
      api("/api/staff"),
      api("/api/damage-reports"),
      api("/api/audit"),
    ]);
  metricGrid([
    ["ห้องพร้อม", overview.rooms.ready],
    ["กำลังเข้าพัก", overview.rooms.occupied],
    ["ห้องปิดซ่อม", overview.rooms.repair],
    ["ยอดรับสุทธิจำลอง", baht(finance.net)],
  ]);
  const promotionSection = section(
    "โปรโมชั่น",
    "ใช้ตามลำดับตัวเลขและลดเฉพาะค่าห้อง การแก้ไขไม่กระทบรายการจองเดิม",
  );
  table(
    promotionSection,
    [
      ["name", "ชื่อ"],
      [(r) => `${r.percentOff}%`, "ส่วนลด"],
      ["priority", "ลำดับ"],
      ["startDate", "เริ่ม"],
      ["endDate", "สิ้นสุด"],
      [(r) => (r.active ? "แสดง" : "ปิด"), "สถานะ"],
    ],
    promotions,
    [
      {
        label: "แก้ไข",
        run: async (r) => {
          const percentOff = Number(prompt("ส่วนลดใหม่ (%)", r.percentOff));
          if (!Number.isFinite(percentOff)) return;
          await api(`/api/promotions/${r.id}`, {
            method: "PATCH",
            body: { percentOff },
          });
        },
        refresh: render,
      },
      {
        label: "เปิด/ปิด",
        run: (r) =>
          api(`/api/promotions/${r.id}`, {
            method: "PATCH",
            body: { active: !r.active },
          }),
        refresh: render,
      },
    ],
  );
  form(
    promotionSection,
    "สร้างโปรโมชั่น",
    [
      { name: "name", label: "ชื่อ" },
      {
        name: "percentOff",
        label: "ส่วนลด (%)",
        type: "number",
        min: 1,
        max: 100,
      },
      { name: "priority", label: "ลำดับ", type: "number", value: 100 },
      { name: "startDate", label: "วันเริ่ม", type: "date" },
      { name: "endDate", label: "วันสิ้นสุด", type: "date" },
      { name: "minNights", label: "คืนขั้นต่ำ", type: "number", min: 1, value: 1 },
      { name: "minRooms", label: "ห้องขั้นต่ำ", type: "number", min: 1, value: 1 },
    ],
    async (values) => {
      await api("/api/promotions", { method: "POST", body: values });
      await render();
    },
  );
  const refundSection = section("อนุมัติคืนเงินจำลอง");
  table(
    refundSection,
    [
      ["id", "#"],
      ["booking_id", "การจอง"],
      ["customerName", "ผู้จอง"],
      [(r) => baht(r.amount), "ยอด"],
      ["reason", "เหตุผล"],
      ["status", "สถานะ"],
    ],
    refunds,
    [
      {
        label: "อนุมัติ",
        when: (r) => r.status === "requested",
        run: (r) =>
          api(`/api/refunds/${r.id}/decision`, {
            method: "POST",
            body: { approved: true },
          }),
        refresh: render,
      },
      {
        label: "ปฏิเสธ",
        when: (r) => r.status === "requested",
        run: (r) =>
          api(`/api/refunds/${r.id}/decision`, {
            method: "POST",
            body: { approved: false },
          }),
        refresh: render,
      },
    ],
  );
  const staffSection = section("สิทธิ์พนักงาน");
  table(
    staffSection,
    [
      ["id", "#"],
      ["email", "อีเมล"],
      ["role", "บทบาท"],
      [(r) => (r.active ? "ใช้งาน" : "ปิด"), "สถานะ"],
    ],
    staff,
    [
      {
        label: "เปลี่ยนบทบาท",
        run: async (r) => {
          const role = prompt(
            "บทบาทใหม่: superadmin, reception, accounting, management, housekeeping",
            r.role,
          );
          if (!role) return;
          await api(`/api/staff/${r.id}`, { method: "PATCH", body: { role } });
        },
        refresh: render,
      },
      {
        label: "เปิด/ปิด",
        run: (r) =>
          api(`/api/staff/${r.id}`, {
            method: "PATCH",
            body: { active: !r.active },
          }),
        refresh: render,
      },
    ],
  );
  form(
    staffSection,
    "เพิ่มพนักงาน",
    [
      { name: "email", label: "อีเมล", type: "email" },
      { name: "password", label: "รหัสผ่าน (อย่างน้อย 10 ตัว)", type: "password" },
      { name: "role", label: "บทบาท", options: roles },
    ],
    async (values) => {
      await api("/api/staff", { method: "POST", body: values });
      await render();
    },
  );
  const roomSection = section("ความเสียหายและห้องปิดซ่อม");
  table(
    roomSection,
    [
      ["id", "#"],
      ["code", "ห้อง"],
      ["details", "รายละเอียด"],
      ["created_at", "เวลา"],
    ],
    damage,
  );
  form(
    roomSection,
    "ปิดห้องเพื่อซ่อม",
    [
      {
        name: "roomId",
        label: "รหัสภายในห้อง (ดูจากผู้ดูแลระบบ)",
        type: "number",
        min: 1,
      },
      { name: "from", label: "เริ่มปิด", type: "date" },
      { name: "to", label: "สิ้นสุด", type: "date" },
      { name: "reason", label: "เหตุผล" },
    ],
    async (values) => {
      await api(`/api/rooms/${values.roomId}/closures`, {
        method: "POST",
        body: values,
      });
      await render();
    },
    "ปิดห้อง",
  );
  form(
    roomSection,
    "เปิดห้องหลังซ่อม",
    [{ name: "roomId", label: "รหัสภายในห้อง", type: "number", min: 1 }],
    async (values) => {
      await api(`/api/rooms/${values.roomId}/reopen`, { method: "POST" });
      await render();
    },
    "เปิดห้อง",
  );
  form(
    roomSection,
    "อนุมัติย้ายห้องฉุกเฉินหลัง Check-in",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      {
        name: "bookingRoomId",
        label: "รายการห้องในใบจอง",
        type: "number",
        min: 1,
      },
      { name: "roomId", label: "ห้องใหม่", type: "number", min: 1 },
      { name: "reason", label: "เหตุผล" },
    ],
    async (values) => {
      await api(`/api/bookings/${values.bookingId}/emergency-move`, {
        method: "POST",
        body: values,
      });
      await render();
    },
    "อนุมัติย้าย",
  );
  note(roomSection, "เมื่อห้องที่จัดไว้ใช้ไม่ได้ ระบบบันทึกข้อเสนอห้องทดแทนให้ลูกค้าตัดสินใจ");
  const auditSection = section("ประวัติทุกฝ่าย");
  table(
    auditSection,
    [
      ["createdAt", "เวลา"],
      ["actorEmail", "ผู้ทำ"],
      ["entity", "รายการ"],
      ["action", "การกระทำ"],
      ["reason", "เหตุผล"],
      [(r) => JSON.stringify(r.beforeValue ?? null), "ก่อน"],
      [(r) => JSON.stringify(r.afterValue ?? null), "หลัง"],
    ],
    audit.slice(0, 80),
  );
}
