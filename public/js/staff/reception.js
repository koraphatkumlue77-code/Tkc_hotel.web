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
  dateLabel,
  status,
  feedback,
  busy,
} from "./common.js";
let activeThread = null;
let chatTimer = null;
function stopChatPolling() {
  clearInterval(chatTimer);
  chatTimer = null;
}
window.addEventListener("pagehide", stopChatPolling);
export async function render() {
  stopChatPolling();
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
    "เปิดรายละเอียดเพื่อตรวจยอดค้างชำระและห้องที่จัดไว้ ก่อนยืนยันเข้าพักหรือเช็คเอาท์",
  );
  const detail = node("div", "", "panel");
  detail.style.marginTop = "1rem";
  detail.append(node("p", "เลือกรายการจองเพื่อดูห้องและยอดค้างชำระ", "subtle"));
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
        readOnly: true,
        run: async (r) => {
          const b = await api(`/api/bookings/${r.id}`);
          detail.replaceChildren(
            node("h3", `การจอง #${b.id} · ${b.customerName}`),
            node("p", `ยอดค้างชำระ ${baht(b.balance)} · ${b.status}`),
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
        intent: "primary",
        help: "ตรวจยอดและห้องพร้อมก่อนยืนยันเข้าพัก",
        when: (r) => r.status === "confirmed",
        run: (r) => api(`/api/bookings/${r.id}/check-in`, { method: "POST" }),
        refresh: render,
      },
      {
        label: "Check-out",
        intent: "primary",
        when: (r) => r.status === "checked_in",
        run: (r) => api(`/api/bookings/${r.id}/check-out`, { method: "POST" }),
        refresh: render,
      },
      {
        label: "No-show",
        intent: "danger",
        help: "ใช้เมื่อยืนยันแล้วว่าผู้จองไม่เข้าพัก",
        when: (r) => r.status === "confirmed",
        run: (r) => api(`/api/bookings/${r.id}/no-show`, { method: "POST" }),
        refresh: render,
      },
    ],
  );
  queue.append(detail);
  const actions = section(
    "Walk-in และบริการหน้าเคาน์เตอร์",
    "เลือกงานที่ต้องการเพื่อเปิดแบบฟอร์ม บริการเพิ่มเติมใช้กับการจองที่เช็คอินแล้ว",
  );
  let selectedCustomer = null;
  const walkIn = form(
    actions,
    "สร้าง Walk-in",
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
          customerId: selectedCustomer?.id,
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
    {
      help: "รายการ Walk-in รับชำระเต็มจำนวนแบบจำลอง หลังสร้างต้องจัดห้องจริงก่อนเช็คอิน",
    },
  );
  const walkInForm = walkIn.box.querySelector("form");
  const customerSearch = node("div", "", "walk-in-customer-search");
  const searchLabel = node("label", "ค้นหาลูกค้าเดิม");
  const customerQuery = document.createElement("input");
  customerQuery.type = "search";
  customerQuery.id = "walk-in-customer-query";
  customerQuery.placeholder = "ชื่อ เบอร์โทร หรือเลขเอกสารเต็ม";
  searchLabel.htmlFor = customerQuery.id;
  const searchButton = node("button", "ค้นหา", "btn btn-outline");
  searchButton.type = "button";
  const searchHelp = node(
    "small",
    "ค้นหาอย่างน้อย 3 ตัวอักษร และตรวจสอบตัวตนก่อนเลือก",
    "field-hint",
  );
  const searchResults = node("div", "", "walk-in-results");
  searchResults.setAttribute("aria-live", "polite");
  customerSearch.append(
    searchLabel,
    customerQuery,
    searchButton,
    searchHelp,
    searchResults,
  );
  walkInForm.prepend(customerSearch);
  function chooseCustomer(customer) {
    selectedCustomer = customer;
    for (const key of ["fullName", "phone", "identityReference"]) {
      walkIn.inputs[key].required = !customer;
      walkIn.inputs[key].parentElement.hidden = Boolean(customer);
    }
    searchResults.replaceChildren();
    if (customer) {
      const chosen = node(
        "p",
        `เลือก ${customer.fullName} · โทรลงท้าย ${customer.phoneLast4} · เอกสารลงท้าย ${customer.identityLast4}`,
      );
      const change = node("button", "เปลี่ยน / เพิ่มลูกค้าใหม่", "btn btn-outline");
      change.type = "button";
      change.addEventListener("click", () => chooseCustomer(null));
      searchResults.append(chosen, change);
    }
  }
  customerQuery.addEventListener("input", () => {
    chooseCustomer(null);
  });
  customerQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchButton.click();
    }
  });
  searchButton.addEventListener("click", async () => {
    chooseCustomer(null);
    const query = customerQuery.value.trim();
    if (query.length < 3) {
      searchResults.replaceChildren(node("p", "กรุณาค้นหาอย่างน้อย 3 ตัวอักษร"));
      return;
    }
    busy(searchButton, true);
    try {
      const customers = await api(
        `/api/walk-in-customers?q=${encodeURIComponent(query)}`,
      );
      if (customerQuery.value.trim() !== query) return;
      searchResults.replaceChildren();
      if (!customers.length)
        searchResults.append(node("p", "ไม่พบลูกค้า สามารถกรอกข้อมูลลูกค้าใหม่ด้านล่าง"));
      if (customers.length === 20)
        searchResults.append(
          node("p", "แสดง 20 รายการแรก กรุณาค้นหาให้เฉพาะเจาะจงขึ้น"),
        );
      for (const customer of customers) {
        const option = node(
          "button",
          `${customer.fullName} · โทรลงท้าย ${customer.phoneLast4} · เอกสารลงท้าย ${customer.identityLast4}`,
          "btn btn-outline",
        );
        option.type = "button";
        option.addEventListener("click", () => chooseCustomer(customer));
        searchResults.append(option);
      }
    } catch (error) {
      searchResults.replaceChildren(node("p", error.message));
    } finally {
      busy(searchButton, false);
    }
  });
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
    {
      help: "ใช้เลขการจองและรหัสรายการห้องจากรายละเอียด พร้อมรหัสห้องจริงจากตารางสถานะห้อง",
    },
  );
  form(
    actions,
    "เพิ่มบริการ",
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
    { help: "เพิ่มบริการหลังเช็คอินและรับชำระจำลองทันที ระบุวันที่สำหรับอาหารเช้า" },
  );
  form(
    actions,
    "บันทึกการติดต่อ",
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
    "บันทึกการติดต่อ",
    { help: "บันทึกผลการติดต่อผู้จองที่มาช้ากว่าเวลาที่แจ้ง เพื่อให้ทีมติดตามต่อได้" },
  );
  form(
    actions,
    "ยกเลิกบริการ",
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
    "ขอคืนค่าบริการ",
    {
      intent: "danger",
      help: "ใช้ตอนเช็คอิน ระบบส่งคำขอคืนค่าบริการ 80% แบบจำลองตามเงื่อนไข",
    },
  );
  const roomSection = section(
    "สถานะห้องและประวัติ",
    "ค้นหาด้วยรหัสห้อง เพื่อดูข้อมูลห้องและประวัติการใช้งาน",
  );
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
          readOnly: true,
          run: async (r) => {
            const h = await api(`/api/rooms/${r.id}/history`);
            searchResult.append(node("pre", JSON.stringify(h, null, 2)));
          },
        },
      ],
    );
  });
  const tourSection = section(
    "เที่ยวตลาดกลางคืน",
    "ตรวจรอบและจำนวนที่ว่างก่อนเพิ่มผู้ร่วมเที่ยวให้การจอง",
  );
  tourSection.classList.add("staff-section-half");
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
    { readOnly: true },
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
    { help: "ตรวจรหัสรอบจากรายการตามวันที่ แล้วระบุชื่อหรือรหัสผู้ร่วมเที่ยวคั่นด้วยจุลภาค" },
  );
  const chatSection = section(
    "สนทนากับสมาชิก",
    "เปิดแชตจากรายการเพื่ออ่านและตอบกลับสมาชิกในบทสนทนาเดิม",
  );
  chatSection.classList.add("staff-section-half");
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
        readOnly: true,
        run: async (r) => {
          activeThread = r.threadId;
          await openChat(chatSection);
        },
      },
    ],
  );
  if (activeThread) await openChat(chatSection);
  const cleaning = section(
    "งานแม่บ้านและความเสียหาย",
    "ติดตาม 30 รายการล่าสุดในแต่ละตาราง เพื่อประสานความพร้อมของห้อง",
  );
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
  roleOverview(
    "ดูแลการเข้าพักและการติดต่อสมาชิก",
    "ฝ่ายต้อนรับตรวจการเข้าพัก จัดการ Walk-in และตอบแชต ส่วนการรับรองหลักฐานชำระเป็นหน้าที่ฝ่ายบัญชี",
    [
      {
        label: "การจองที่ยืนยันแล้ว",
        value: bookings.filter((item) => item.status === "confirmed").length,
        target: queue,
        detail: "ตรวจวันเข้าพัก ยอด และห้องก่อนเช็คอิน",
      },
      {
        label: "รายการที่เข้าพักอยู่",
        value: bookings.filter((item) => item.status === "checked_in").length,
        target: queue,
        detail: "ดูรายละเอียดเพื่อบริการหรือเช็คเอาท์",
      },
      {
        label: "บทสนทนาที่มีข้อความ",
        value: chats.filter((item) => item.messageCount).length,
        target: chatSection,
        detail: "เปิดบทสนทนาเพื่ออ่านและตอบสมาชิก",
      },
    ],
  );
}
async function openChat(parent) {
  stopChatPolling();
  parent.querySelector(".chat-panel")?.remove();
  const threadId = activeThread;
  const box = node("div", "", "panel chat-panel");
  box.style.marginTop = "1rem";
  const close = node("button", "ปิดแชต", "btn btn-outline");
  close.type = "button";
  close.addEventListener("click", () => {
    stopChatPolling();
    activeThread = null;
    box.remove();
  });
  box.append(node("h3", `สนทนากับสมาชิก #${threadId}`), close);
  const log = node("div", "", "chat-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-label", "ข้อความสนทนา");
  box.append(log);
  const f = node("form", "", "field-row");
  f.style.marginTop = "1rem";
  const input = document.createElement("input");
  input.required = true;
  input.maxLength = 2000;
  input.setAttribute("aria-label", "ข้อความตอบกลับ");
  const button = node("button", "ส่ง", "btn btn-dark");
  f.append(input, button);
  box.append(f);
  parent.append(box);
  let requestNumber = 0;
  async function refreshMessages() {
    const request = ++requestNumber;
    const messages = await api(`/api/chats/${threadId}/messages`);
    if (
      !box.isConnected ||
      activeThread !== threadId ||
      request !== requestNumber
    )
      return;
    const contents = [];
    if (!messages.length)
      contents.push(
        node("p", "ยังไม่มีข้อความ เริ่มสนทนาด้วยการส่งข้อความด้านล่าง", "subtle small"),
      );
    for (const m of messages)
      contents.push(
        node(
          "div",
          `${m.senderRole === "reception" ? "ฝ่ายต้อนรับ" : "สมาชิก"}: ${m.content}`,
          `chat-bubble${m.senderRole === "reception" ? " staff-reply" : ""}`,
        ),
      );
    log.replaceChildren(...contents);
  }
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(button, true);
    try {
      await api(`/api/chats/${threadId}/messages`, {
        method: "POST",
        body: { content: input.value },
      });
      input.value = "";
      await refreshMessages();
    } catch (error) {
      status(feedback, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
  await refreshMessages();
  if (!box.isConnected || activeThread !== threadId) return;
  chatTimer = setInterval(() => {
    if (!box.isConnected) {
      stopChatPolling();
      return;
    }
    if (!document.hidden)
      refreshMessages().catch((error) =>
        status(feedback, error.message, "error"),
      );
  }, 15000);
}
