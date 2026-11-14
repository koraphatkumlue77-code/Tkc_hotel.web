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
  dateLabel,
  status,
  feedback,
  busy,
} from "./common.js";
let activeThread = null;
export async function render() {
  clear();
  const [overview, bookings, rooms, chats, tasks, damage] = await Promise.all([
    api("/api/reports/overview"),
    api("/api/bookings"),
    api("/api/rooms?limit=30"),
    api("/api/chats"),
    api("/api/housekeeping/tasks"),
    api("/api/damage-reports"),
  ]);
  metricGrid([
    ["เข้าพักอยู่", overview.rooms.occupied],
    ["ห้องพร้อม", overview.rooms.ready],
    ["รอแม่บ้าน", overview.rooms.dirty],
    ["แชตสมาชิก", chats.filter((x) => x.messageCount).length],
  ]);
  const queue = section(
    "งานหน้าเคาน์เตอร์",
    "ตรวจยอดคงเหลือ ห้องพร้อม และเวลา ก่อน Check-in",
  );
  const detail = node("div", "", "panel");
  detail.style.marginTop = "1rem";
  detail.append(node("p", "เลือกรายการจองเพื่อดูห้องและยอดคงเหลือ", "subtle"));
  table(
    queue,
    [
      ["id", "#"],
      ["customerName", "ผู้จอง"],
      [(r) => `${dateLabel(r.checkIn)} – ${dateLabel(r.checkOut)}`, "ช่วงวัน"],
      ["status", "สถานะ"],
      [(r) => baht(r.total), "ยอด"],
    ],
    bookings,
    [
      {
        label: "รายละเอียด",
        run: async (r) => {
          const b = await api(`/api/bookings/${r.id}`);
          detail.replaceChildren(
            node("h3", `การจอง #${b.id} · ${b.customerName}`),
            node("p", `ยอดคงเหลือ ${baht(b.balance)} · ${b.status}`),
          );
          for (const room of b.rooms)
            detail.append(
              node(
                "p",
                `รายการห้อง #${room.id} · ${room.typeName} · ${room.code || "ยังไม่จัดห้อง"}`,
              ),
            );
        },
      },
      {
        label: "Check-in",
        when: (r) => r.status === "confirmed",
        run: (r) => api(`/api/bookings/${r.id}/check-in`, { method: "POST" }),
        refresh: render,
      },
      {
        label: "Check-out",
        when: (r) => r.status === "checked_in",
        run: (r) => api(`/api/bookings/${r.id}/check-out`, { method: "POST" }),
        refresh: render,
      },
      {
        label: "No-show",
        when: (r) => r.status === "confirmed",
        run: (r) => api(`/api/bookings/${r.id}/no-show`, { method: "POST" }),
        refresh: render,
      },
    ],
  );
  queue.append(detail);
  const actions = section("Walk-in และบริการหน้าเคาน์เตอร์");
  form(
    actions,
    "สร้าง Walk-in ชำระเต็มจำลอง",
    [
      { name: "fullName", label: "ชื่อผู้จอง" },
      { name: "phone", label: "เบอร์โทร" },
      { name: "identityReference", label: "บัตรหรือพาสปอร์ตสมมติ" },
      { name: "typeId", label: "รหัสประเภทห้อง", type: "number", min: 1 },
      { name: "guests", label: "ผู้เข้าพัก", type: "number", min: 1 },
      { name: "checkIn", label: "วันเข้า", type: "date" },
      { name: "checkOut", label: "วันออก", type: "date" },
    ],
    async (values) => {
      const b = await api("/api/walk-ins", {
        method: "POST",
        body: {
          ...values,
          rooms: [{ typeId: values.typeId, guests: values.guests }],
        },
      });
      status(
        feedback,
        `สร้าง Walk-in #${b.id} แล้ว กรุณาจัดห้องจริงก่อน Check-in`,
        "success",
      );
      await render();
    },
    "สร้าง Walk-in",
  );
  form(
    actions,
    "จัดห้อง Walk-in",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      { name: "bookingRoomId", label: "รหัสรายการห้อง", type: "number", min: 1 },
      { name: "roomId", label: "รหัสห้องจริง", type: "number", min: 1 },
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
  form(
    actions,
    "เพิ่มบริการหลัง Check-in พร้อมรับชำระจำลองทันที",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      {
        name: "kind",
        label: "บริการ",
        options: [
          ["breakfast", "อาหารเช้า"],
          ["fitness", "ฟิตเนส"],
          ["sauna", "ซาวน่า"],
        ],
      },
      {
        name: "date",
        label: "วันที่อาหารเช้า (เว้นได้สำหรับฟิตเนส/ซาวน่า)",
        type: "date",
        required: false,
      },
    ],
    async (values) => {
      await api(`/api/bookings/${values.bookingId}/services`, {
        method: "POST",
        body: { kind: values.kind, date: values.date || null },
      });
      await render();
    },
    "เพิ่มและรับชำระ",
  );
  form(
    actions,
    "บันทึกผลติดต่อเมื่อมาช้ากว่าแจ้ง",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      { name: "outcome", label: "ผลการติดต่อ", type: "textarea" },
    ],
    async (values) => {
      await api(`/api/bookings/${values.bookingId}/late-arrival-contact`, {
        method: "POST",
        body: { outcome: values.outcome },
      });
      await render();
    },
  );
  form(
    actions,
    "ยกเลิกบริการตอน Check-in",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      {
        name: "kind",
        label: "บริการ",
        options: [
          ["breakfast", "อาหารเช้า"],
          ["fitness", "ฟิตเนส"],
          ["sauna", "ซาวน่า"],
        ],
      },
    ],
    async (values) => {
      await api(`/api/bookings/${values.bookingId}/services/cancel`, {
        method: "POST",
        body: { kind: values.kind },
      });
      await render();
    },
    "ส่งคำขอคืน 80% จำลอง",
  );
  const roomSection = section("สถานะห้องและประวัติ");
  table(
    roomSection,
    [
      ["id", "#"],
      ["code", "รหัส"],
      ["typeName", "ประเภท"],
      ["status", "สถานะ"],
    ],
    rooms,
  );
  const search = node("form", "", "field-row");
  const code = document.createElement("input");
  code.placeholder = "ค้นหารหัสห้อง";
  code.setAttribute("aria-label", "รหัสห้อง");
  const button = node("button", "ค้นหา", "btn btn-outline");
  search.append(code, button);
  const searchResult = node("div");
  roomSection.append(search, searchResult);
  search.addEventListener("submit", async (event) => {
    event.preventDefault();
    searchResult.replaceChildren();
    const rows = await api(`/api/rooms?code=${encodeURIComponent(code.value)}`);
    table(
      searchResult,
      [
        ["id", "#"],
        ["code", "ห้อง"],
        ["typeName", "ประเภท"],
        ["status", "สถานะ"],
      ],
      rows,
      [
        {
          label: "ประวัติ",
          run: async (r) => {
            const h = await api(`/api/rooms/${r.id}/history`);
            searchResult.append(node("pre", JSON.stringify(h, null, 2)));
          },
        },
      ],
    );
  });
  const tourSection = section("เที่ยวตลาดกลางคืน");
  form(
    tourSection,
    "ดูรอบเที่ยวตามวันที่",
    [{ name: "date", label: "วันที่", type: "date" }],
    async (values) => {
      const slots = await api(`/api/tours/slots?date=${values.date}`);
      const box = node("div");
      table(
        box,
        [
          ["id", "#"],
          ["date", "วันที่"],
          ["time", "รอบ"],
          ["capacity", "ความจุ"],
          ["taken", "ใช้แล้ว"],
          ["available", "ว่าง"],
        ],
        slots,
      );
      tourSection.append(box);
    },
    "ดูรอบ",
  );
  form(
    tourSection,
    "เพิ่มผู้ร่วมเที่ยว",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      { name: "slotId", label: "รหัสรอบเที่ยว", type: "number", min: 1 },
      { name: "participants", label: "ชื่อหรือรหัสผู้ร่วม (คั่นด้วยจุลภาค)" },
    ],
    async (values) => {
      await api("/api/tours/reservations", {
        method: "POST",
        body: {
          bookingId: values.bookingId,
          slotId: values.slotId,
          participants: values.participants
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      await render();
    },
    "จองรอบเที่ยว",
  );
  const chatSection = section("สนทนากับสมาชิก");
  table(
    chatSection,
    [
      ["threadId", "รหัสสมาชิก"],
      ["customerName", "ชื่อ"],
      ["messageCount", "ข้อความ"],
      ["lastMessageAt", "ล่าสุด"],
    ],
    chats,
    [
      {
        label: "เปิดแชต",
        run: async (r) => {
          activeThread = r.threadId;
          await openChat(chatSection);
        },
      },
    ],
  );
  if (activeThread) await openChat(chatSection);
  const cleaning = section("งานแม่บ้านและความเสียหาย");
  table(
    cleaning,
    [
      ["id", "#"],
      ["code", "ห้อง"],
      ["status", "สถานะ"],
      ["employee_id", "ผู้ทำ"],
      ["finished_at", "เสร็จเมื่อ"],
    ],
    tasks.slice(0, 30),
  );
  table(
    cleaning,
    [
      ["id", "#"],
      ["code", "ห้อง"],
      ["details", "รายละเอียด"],
      ["created_at", "รายงานเมื่อ"],
    ],
    damage.slice(0, 30),
  );
}
async function openChat(parent) {
  const old = parent.querySelector(".chat-panel");
  old?.remove();
  const box = node("div", "", "panel chat-panel");
  box.style.marginTop = "1rem";
  box.append(node("h3", `สนทนากับสมาชิก #${activeThread}`));
  const messages = await api(`/api/chats/${activeThread}/messages`);
  const log = node("div", "", "chat-log");
  for (const m of messages) {
    const bubble = node(
      "div",
      `${m.senderRole === "reception" ? "ฝ่ายต้อนรับ" : "สมาชิก"}: ${m.content}`,
      "chat-bubble",
    );
    log.append(bubble);
  }
  box.append(log);
  const f = node("form", "", "field-row");
  f.style.marginTop = "1rem";
  const input = document.createElement("input");
  input.required = true;
  input.maxLength = 2000;
  input.setAttribute("aria-label", "ข้อความตอบกลับ");
  const button = node("button", "ส่ง", "btn btn-dark");
  f.append(input, button);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(button, true);
    try {
      await api(`/api/chats/${activeThread}/messages`, {
        method: "POST",
        body: { content: input.value },
      });
      await openChat(parent);
    } catch (error) {
      status(feedback, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
  box.append(f);
  parent.append(box);
}
