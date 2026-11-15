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
  ["reception", "ฝ่ายต้อนรับ"],
  ["accounting", "ฝ่ายบัญชี"],
  ["housekeeping", "แม่บ้าน"],
];
export async function render() {
  clear();
  const [types, bookings, attractions, reviews, staff, escalations, overview] =
    await Promise.all([
      api("/api/rooms/types"),
      api("/api/bookings"),
      api("/api/attractions/all"),
      api("/api/reviews"),
      api("/api/staff"),
      api("/api/payments/escalations"),
      api("/api/reports/overview"),
    ]);
  metricGrid([
    ["ห้องทั้งหมด", overview.rooms.total],
    ["พร้อมเข้าพัก", overview.rooms.ready],
    ["รอทำความสะอาด", overview.rooms.dirty],
    ["เรื่องชำระที่ติดตาม", escalations.length],
  ]);
  const roomSection = section(
    "ประเภทและห้องพัก",
    "ตั้งค่าราคาและจำนวนผู้เข้าพัก เพิ่มประเภทก่อนเพิ่มห้องจริง แล้วค้นหารหัสห้องเพื่อตรวจสอบ",
  );
  table(
    roomSection,
    [
      ["id", "#"],
      ["name", "ประเภท"],
      ["capacity", "คนสูงสุด"],
      [(r) => baht(r.nightlyPrice), "ราคา/คืน"],
      [(r) => baht(r.breakfastPrice), "อาหารเช้า"],
    ],
    types,
    [
      {
        label: "แก้ราคา",
        run: async (r) => {
          const value = prompt("ราคาต่อคืนใหม่", r.nightlyPrice);
          if (value === null) return false;
          const price = Number(value);
          if (!value.trim() || !Number.isInteger(price) || price < 0)
            throw new Error("กรุณาระบุราคาเป็นจำนวนเต็มที่ไม่ติดลบ");
          await api(`/api/rooms/types/${r.id}`, {
            method: "PATCH",
            body: { nightlyPrice: price },
          });
        },
        refresh: render,
      },
    ],
  );
  form(
    roomSection,
    "เพิ่มประเภทห้อง",
    [
      { name: "name", label: "ชื่อประเภท" },
      { name: "capacity", label: "คนสูงสุด", type: "number", min: 1 },
      { name: "nightlyPrice", label: "ราคา/คืน", type: "number", min: 0 },
      { name: "breakfastPrice", label: "อาหารเช้าต่อวัน", type: "number", min: 0 },
      {
        name: "description",
        label: "คำอธิบาย",
        type: "textarea",
        required: false,
      },
    ],
    async (values) => {
      await api("/api/rooms/types", { method: "POST", body: values });
      await render();
    },
    "เพิ่มประเภทห้อง",
    { help: "ราคาต่อคืนและราคาอาหารเช้าใช้สำหรับการคำนวณการจองตามเงื่อนไขของระบบ" },
  );
  form(
    roomSection,
    "เพิ่มห้องจริง",
    [
      { name: "typeId", label: "รหัสประเภท", type: "number", min: 1 },
      { name: "code", label: "รหัสห้อง เช่น Std301" },
      {
        name: "areaSqm",
        label: "พื้นที่ ตร.ม.",
        type: "number",
        min: 1,
        required: false,
      },
    ],
    async (values) => {
      await api("/api/rooms", { method: "POST", body: values });
      await render();
    },
    "เพิ่มห้องจริง",
    { help: "ใช้เลข # ของประเภทห้องจากตารางด้านบน และกำหนดรหัสห้องที่ไม่ซ้ำกัน" },
  );
  const search = document.createElement("form");
  search.className = "field-row";
  const input = document.createElement("input");
  input.placeholder = "ค้นหารหัสห้อง เช่น Std001";
  input.setAttribute("aria-label", "ค้นหารหัสห้อง");
  const button = node("button", "ค้นหา", "btn btn-outline");
  search.append(input, button);
  roomSection.append(search);
  const result = node("div");
  roomSection.append(result);
  search.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.replaceChildren();
    const rooms = await api(
      `/api/rooms?code=${encodeURIComponent(input.value)}&limit=100`,
    );
    table(
      result,
      [
        ["id", "#"],
        ["code", "รหัสห้อง"],
        ["typeName", "ประเภท"],
        ["status", "สถานะ"],
        ["areaSqm", "พื้นที่"],
      ],
      rooms,
      [
        {
          label: "แก้พื้นที่",
          run: async (r) => {
            const value = prompt("พื้นที่ ตร.ม.", r.areaSqm || "");
            if (value === null) return false;
            const areaSqm = Number(value);
            if (!value.trim() || !Number.isInteger(areaSqm) || areaSqm < 1)
              throw new Error("กรุณาระบุพื้นที่เป็นจำนวนเต็มมากกว่าศูนย์");
            await api(`/api/rooms/${r.id}`, {
              method: "PATCH",
              body: { areaSqm },
            });
          },
          refresh: () => search.requestSubmit(),
        },
      ],
    );
  });
  const bookingSection = section(
    "จัดห้องหลังบัญชีรับรอง",
    "ตรวจรายการห้องในใบจอง แล้วจัดเลขห้องจริงให้พร้อมก่อนเช็คอิน",
  );
  table(
    bookingSection,
    [
      ["id", "#"],
      ["customerName", "ผู้จอง"],
      ["checkIn", "เข้า"],
      ["checkOut", "ออก"],
      ["status", "สถานะ"],
    ],
    bookings.filter((b) =>
      ["confirmed", "replacement_pending"].includes(b.status),
    ),
    [
      {
        label: "ดูรายการห้อง",
        readOnly: true,
        help: "เปิดดูรหัสรายการห้องเพื่อนำไปจัดห้องจริง",
        run: async (r) => {
          const detail = await api(`/api/bookings/${r.id}`);
          const old = bookingSection.querySelector(".booking-room-detail");
          old?.remove();
          const box = node("div", "", "panel booking-room-detail");
          box.append(node("h3", `การจอง #${r.id}`));
          for (const room of detail.rooms)
            box.append(
              node(
                "p",
                `รายการห้อง #${room.id} · ${room.typeName} · ${room.guests} คน · ${room.code || "ยังไม่จัดห้อง"}`,
              ),
            );
          bookingSection.append(box);
        },
      },
    ],
  );
  form(
    bookingSection,
    "จัดห้องจริง",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      {
        name: "bookingRoomId",
        label: "รหัสรายการห้องในใบจอง",
        type: "number",
        min: 1,
      },
      { name: "roomId", label: "รหัสห้องจริง", type: "number", min: 1 },
      { name: "reason", label: "เหตุผล (กรณีเปลี่ยนห้อง)", required: false },
    ],
    async (values) => {
      await api(`/api/bookings/${values.bookingId}/assignments`, {
        method: "POST",
        body: values,
      });
      await render();
    },
    "จัดห้อง",
    {
      help: "ใช้เลขการจองและรหัสรายการห้องจากปุ่มดูรายการห้อง รหัสห้องจริงหาได้จากช่องค้นหาด้านบน",
    },
  );
  note(
    bookingSection,
    "กดดูห้องในรายการเพื่อดูรหัสรายการห้อง แล้วค้นหารหัสห้องจริงจากช่องค้นหาด้านบน",
  );
  form(
    bookingSection,
    "เสนอห้องทดแทน",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      { name: "bookingRoomId", label: "รหัสรายการห้อง", type: "number", min: 1 },
      { name: "roomId", label: "ห้องทดแทน", type: "number", min: 1 },
    ],
    async (values) => {
      await api(`/api/bookings/${values.bookingId}/replacements`, {
        method: "POST",
        body: values,
      });
      await render();
    },
    "เสนอห้อง",
    { help: "เสนอห้องใหม่เมื่อห้องเดิมใช้ไม่ได้ ผู้จองต้องพิจารณาข้อเสนอก่อนดำเนินการต่อ" },
  );
  const escalationSection = section(
    "ติดตามการชำระ",
    "รายการที่รอตรวจเกิน 30 นาที ควรประสานฝ่ายบัญชีให้ตรวจหลักฐาน",
  );
  escalationSection.classList.add("staff-section-half");
  table(
    escalationSection,
    [
      ["id", "#"],
      ["paymentId", "รายการชำระ"],
      ["bookingId", "การจอง"],
      ["createdAt", "แจ้งเมื่อ"],
      ["status", "สถานะ"],
    ],
    escalations,
  );
  const attractionSection = section(
    "สถานที่แนะนำตามฤดูกาล",
    "จัดการข้อมูลที่แสดงบนเว็บไซต์ลูกค้า เปิดหรือซ่อนโดยไม่ลบข้อมูลเดิม",
  );
  attractionSection.classList.add("staff-section-half");
  table(
    attractionSection,
    [
      ["id", "#"],
      ["name", "สถานที่"],
      ["season", "ฤดู"],
      [(r) => (r.visible ? "แสดง" : "ซ่อน"), "สถานะ"],
    ],
    attractions,
    [
      {
        label: "เปิด/ปิด",
        run: (r) =>
          api(`/api/attractions/${r.id}`, {
            method: "PATCH",
            body: { visible: !r.visible },
          }),
        refresh: render,
      },
      {
        label: "แก้คำอธิบาย",
        run: async (r) => {
          const description = prompt("คำอธิบายใหม่", r.description);
          if (!description) return false;
          await api(`/api/attractions/${r.id}`, {
            method: "PATCH",
            body: { description },
          });
        },
        refresh: render,
      },
    ],
  );
  form(
    attractionSection,
    "เพิ่มสถานที่",
    [
      { name: "name", label: "ชื่อ" },
      { name: "description", label: "คำอธิบาย", type: "textarea" },
      {
        name: "season",
        label: "ฤดู",
        options: [
          ["all", "ทุกฤดู"],
          ["summer", "ฤดูร้อน"],
          ["rainy", "ฤดูฝน"],
          ["winter", "ฤดูหนาว"],
        ],
      },
    ],
    async (values) => {
      await api("/api/attractions", { method: "POST", body: values });
      await render();
    },
    "เพิ่มสถานที่",
  );
  const reviewSection = section(
    "ตรวจรีวิว",
    "อ่านเนื้อหาก่อนซ่อนรีวิว และระบุเหตุผลสำหรับบันทึกการตรวจสอบ",
  );
  table(
    reviewSection,
    [
      ["id", "#"],
      ["reviewerName", "ผู้เขียน"],
      ["rating", "ดาว"],
      ["content", "ข้อความ"],
    ],
    reviews,
    [
      {
        label: "ซ่อนรีวิว",
        intent: "danger",
        run: async (r) => {
          const reason = prompt("เหตุผลที่ซ่อนรีวิว");
          if (!reason) return false;
          await api(`/api/reviews/${r.id}/hide`, {
            method: "POST",
            body: { reason },
          });
        },
        refresh: render,
      },
    ],
  );
  const staffSection = section(
    "สิทธิ์พนักงานฝ่ายอื่น",
    "จัดการฝ่ายต้อนรับ บัญชี และแม่บ้าน ส่วนสิทธิ์ผู้บริหารดูแลโดยฝ่ายบริหาร",
  );
  table(
    staffSection,
    [
      ["id", "#"],
      ["email", "อีเมล"],
      ["role", "บทบาท"],
      [(r) => (r.active ? "ใช้งาน" : "ปิด"), "สถานะ"],
    ],
    staff.filter((x) => !["management", "superadmin"].includes(x.role)),
    [
      {
        label: "เปลี่ยนสิทธิ์",
        run: async (r) => {
          const role = prompt(
            "บทบาทใหม่: reception, accounting, housekeeping",
            r.role,
          );
          if (!role) return false;
          await api(`/api/staff/${r.id}`, {
            method: "PATCH",
            body: { role },
          });
        },
        refresh: render,
      },
    ],
  );
  form(
    staffSection,
    "เพิ่มพนักงานฝ่ายอื่น",
    [
      { name: "email", label: "อีเมล", type: "email" },
      { name: "password", label: "รหัสผ่าน", type: "password" },
      { name: "role", label: "บทบาท", options: roles },
    ],
    async (values) => {
      await api("/api/staff", { method: "POST", body: values });
      await render();
    },
    "เพิ่มพนักงาน",
    { help: "เลือกบทบาทตามหน้าที่ของพนักงาน บัญชีใหม่จะเข้าใช้งานผ่านหน้าเข้าสู่ระบบเดียวกัน" },
  );
  roleOverview(
    "จัดห้องและดูแลข้อมูลโรงแรม",
    "ผู้ดูแลระบบจัดห้องจริงและข้อมูลที่เผยแพร่ ส่วนการรับรองชำระและอนุมัติคืนเงินแยกตามฝ่ายที่รับผิดชอบ",
    [
      {
        label: "ยืนยัน / รอห้องทดแทน",
        value: bookings.filter((item) =>
          ["confirmed", "replacement_pending"].includes(item.status),
        ).length,
        target: bookingSection,
        detail: "ดูรายการห้องเพื่อตรวจการจัดห้องจริง",
      },
      {
        label: "รายการติดตามการชำระ",
        value: escalations.length,
        target: escalationSection,
        detail: "ตรวจรายการที่ส่งต่อให้ติดตามกับฝ่ายบัญชี",
      },
      {
        label: "ประเภทห้องที่ดูแล",
        value: types.length,
        target: roomSection,
        detail: "จัดราคา ความจุ และห้องพักแต่ละประเภท",
      },
    ],
  );
}
