import {
  api,
  node,
  clear,
  section,
  metricGrid,
  roleOverview,
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
        label: "แก้ส่วนลด",
        run: async (r) => {
          const value = prompt("ส่วนลดใหม่ (%)", r.percentOff);
          if (value === null) return false;
          const percentOff = Number(value);
          if (
            !value.trim() ||
            !Number.isFinite(percentOff) ||
            percentOff <= 0 ||
            percentOff > 100
          )
            throw new Error("กรุณาระบุส่วนลดมากกว่า 0 และไม่เกิน 100 เปอร์เซ็นต์");
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
    "สร้างโปรโมชั่น",
    { help: "กำหนดวันที่และเงื่อนไขขั้นต่ำ ลำดับตัวเลขใช้จัดลำดับโปรโมชั่นตามกติกาของระบบ" },
  );
  const refundSection = section(
    "อนุมัติคืนเงินจำลอง",
    "ตรวจยอดและเหตุผลก่อนตัดสินใจ ฝ่ายบัญชีจะบันทึกคืนหลังอนุมัติ",
  );
  refundSection.classList.add("staff-section-half");
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
        intent: "primary",
        help: "ส่งต่อให้ฝ่ายบัญชีบันทึกคืนเงิน",
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
        intent: "danger",
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
  const staffSection = section(
    "สิทธิ์พนักงาน",
    "เปลี่ยนบทบาทให้ตรงหน้าที่ หรือเปิดและปิดการใช้งานบัญชี",
  );
  staffSection.classList.add("staff-section-half");
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
          if (!role) return false;
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
    "เพิ่มพนักงาน",
    { help: "กำหนดสิทธิ์ตามหน้าที่ และใช้รหัสผ่านอย่างน้อย 10 ตัวอักษร" },
  );
  const roomSection = section(
    "ความเสียหายและห้องปิดซ่อม",
    "ตรวจรายงานก่อนปิดซ่อม ระบุช่วงวันที่และเหตุผลให้ชัดเจน",
  );
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
    {
      intent: "danger",
      help: "ใช้รหัสภายในห้องจากผู้ดูแลระบบ การปิดซ่อมมีผลต่อความพร้อมของห้องในช่วงวันที่เลือก",
    },
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
    { help: "ยืนยันว่าการซ่อมเสร็จและห้องพร้อมใช้งานก่อนเปิดกลับเข้าสู่ระบบ" },
  );
  form(
    roomSection,
    "ย้ายห้องฉุกเฉิน",
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
    { help: "ใช้สำหรับผู้เข้าพักที่เช็คอินแล้ว ระบุรายการห้อง ห้องใหม่ และเหตุผลการย้าย" },
  );
  note(roomSection, "เมื่อห้องที่จัดไว้ใช้ไม่ได้ ระบบบันทึกข้อเสนอห้องทดแทนให้ลูกค้าตัดสินใจ");
  const auditSection = section(
    "ประวัติทุกฝ่าย",
    "แสดง 80 รายการล่าสุดสำหรับตรวจสอบผู้ดำเนินการและเหตุผล",
  );
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
  roleOverview(
    "ตัดสินใจและดูแลความพร้อมโรงแรม",
    "ฝ่ายบริหารอนุมัติคืนเงิน ดูแลสิทธิ์และห้องปิดซ่อม ส่วนการบันทึกคืนเงินดำเนินการโดยฝ่ายบัญชี",
    [
      {
        label: "คำขอคืนรอตัดสินใจ",
        value: refunds.filter((item) => item.status === "requested").length,
        target: refundSection,
        detail: "ตรวจเหตุผลและยอดก่อนอนุมัติหรือปฏิเสธ",
      },
      {
        label: "รายงานความเสียหาย",
        value: damage.length,
        target: roomSection,
        detail: "เปิดดูรายงานเพื่อพิจารณาความพร้อมของห้อง",
      },
      {
        label: "บัญชีพนักงาน",
        value: staff.length,
        target: staffSection,
        detail: "ตรวจบทบาทและสถานะการใช้งาน",
      },
    ],
  );
}
