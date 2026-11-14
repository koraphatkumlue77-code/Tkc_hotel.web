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
  const roomSection = section("ประเภทและห้องพัก");
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
          const price = Number(prompt("ราคาต่อคืนใหม่", r.nightlyPrice));
          if (!Number.isInteger(price) || price < 0) return;
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
            const areaSqm = Number(prompt("พื้นที่ ตร.ม.", r.areaSqm || ""));
            if (!Number.isInteger(areaSqm)) return;
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
    "Superadmin จัดหรือเปลี่ยนเลขห้องจริงก่อน Check-in",
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
        label: "ดูห้องในรายการ",
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
  );
  const escalationSection = section("ติดตามการตรวจชำระเกิน 30 นาที");
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
  const attractionSection = section("สถานที่แนะนำตามฤดูกาล");
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
          if (description)
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
  );
  const reviewSection = section("ตรวจรีวิว");
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
        label: "ซ่อน",
        run: async (r) => {
          const reason = prompt("เหตุผลที่ซ่อนรีวิว");
          if (reason)
            await api(`/api/reviews/${r.id}/hide`, {
              method: "POST",
              body: { reason },
            });
        },
        refresh: render,
      },
    ],
  );
  const staffSection = section("สิทธิ์พนักงานฝ่ายอื่น");
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
          if (role)
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
  );
}
