import { api, ApiError } from "./api.js";
import {
  baht,
  node,
  clear,
  status,
  busy,
  setupNav,
  dateLabel,
  bookingStatusLabel,
} from "./ui.js";
setupNav();
const authSection = document.querySelector("#authSection"),
  memberSection = document.querySelector("#memberSection"),
  message = document.querySelector("#accountStatus"),
  list = document.querySelector("#bookingList"),
  detailBox = document.querySelector("#bookingDetail");
const params = new URLSearchParams(location.search);
let me = null,
  selectedId = Number(params.get("bookingId")) || null,
  chatTimer = null;
async function loadMe() {
  try {
    me = await api("/api/me");
    if (me.role !== "member") {
      status(message, "บัญชีพนักงานใช้พื้นที่พนักงาน", "info");
      const link = node("a", "ไปพื้นที่พนักงาน →", "btn btn-dark");
      link.href = "/staff/index.html";
      message.append(link);
      return;
    }
    authSection.hidden = true;
    memberSection.hidden = false;
    document.querySelector("#welcomeName").textContent = `สวัสดี ${me.fullName}`;
    await loadBookings();
    await loadChat();
    clearInterval(chatTimer);
    chatTimer = setInterval(loadChat, 15000);
  } catch (error) {
    me = null;
    authSection.hidden = false;
    memberSection.hidden = true;
    if (error.status !== 401) status(message, error.message, "error");
  }
}
function formRow(labelText, input) {
  const wrap = node("div");
  const label = node("label", labelText);
  label.htmlFor = input.id;
  wrap.append(label, input);
  return wrap;
}
function makeInput(id, type = "text", value = "") {
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.value = value;
  return input;
}
function actionButton(text, handler, className = "btn btn-outline") {
  const button = node("button", text, className);
  button.type = "button";
  button.addEventListener("click", async () => {
    busy(button, true);
    try {
      await handler();
      await loadBookings();
    } catch (error) {
      status(message, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
  return button;
}
async function loadBookings() {
  const bookings = await api("/api/bookings/mine");
  clear(list);
  if (!bookings.length) {
    list.append(node("p", "ยังไม่มีรายการจอง", "status info"));
    return;
  }
  for (const booking of bookings) {
    const button = node(
      "button",
      "",
      `booking-item${selectedId === booking.id ? " active" : ""}`,
    );
    button.type = "button";
    button.append(
      node("strong", `รายการ #${booking.id}`),
      node(
        "div",
        `${dateLabel(booking.checkIn)} – ${dateLabel(booking.checkOut)}`,
        "small",
      ),
      node("span", bookingStatusLabel(booking.status), "badge"),
    );
    button.addEventListener("click", () => {
      selectedId = booking.id;
      loadBookings();
      loadDetail();
    });
    list.append(button);
  }
  selectedId ||= bookings[0].id;
  await loadDetail();
}
async function loadDetail() {
  if (!selectedId) return;
  const b = await api(`/api/bookings/${selectedId}`);
  clear(detailBox);
  detailBox.append(
    node("span", `BOOKING #${b.id}`, "eyebrow"),
    node("h2", `${dateLabel(b.check_in)} – ${dateLabel(b.check_out)}`),
  );
  detailBox.append(
    node("span", `สถานะ: ${bookingStatusLabel(b.status)}`, "badge"),
  );
  const rooms = node("div", "", "mini-list");
  for (const room of b.rooms)
    rooms.append(
      node(
        "div",
        `${room.typeName} · ${room.guests} ท่าน${room.code ? ` · ห้อง ${room.code}` : ""}`,
      ),
    );
  detailBox.append(node("h3", "ห้องพัก"), rooms);
  const amounts = node("div", "", "stack");
  for (const [label, value] of [
    ["ยอดรวม", b.total],
    ["ชำระจำลองแล้ว", b.paid],
    ["ยอดคงเหลือ", b.balance],
  ]) {
    const row = node("div", "", "price-line");
    row.append(node("span", label), node("strong", baht(value)));
    amounts.append(row);
  }
  detailBox.append(
    amounts,
    node("p", "รายการชำระและคืนเงินเป็นข้อมูลจำลอง ไม่มีการเคลื่อนเงินจริง", "demo-note"),
  );
  const actions = node("div", "", "stack");
  actions.style.marginTop = "1.5rem";
  if (b.balance > 0 && ["confirmed", "held"].includes(b.status)) {
    const paymentForm = node("form", "", "stack");
    const amount = makeInput("balanceAmount", "number", String(b.balance));
    amount.min = "1";
    amount.max = String(b.balance);
    const method = document.createElement("select");
    method.id = "balanceMethod";
    for (const [value, label] of [
      ["online_demo", "ออนไลน์จำลอง"],
      ["transfer_demo", "โอนจำลองพร้อมหลักฐาน"],
    ]) {
      const option = node("option", label);
      option.value = value;
      method.append(option);
    }
    const file = makeInput("balanceEvidence", "file");
    file.accept = "image/jpeg,image/png,image/webp";
    file.hidden = true;
    method.addEventListener(
      "change",
      () => (file.hidden = method.value !== "transfer_demo"),
    );
    const button = node("button", "ส่งยอดชำระจำลอง", "btn btn-primary");
    button.type = "submit";
    paymentForm.append(
      node("h3", "ชำระยอดคงเหลือ"),
      formRow("จำนวนบาท", amount),
      formRow("ช่องทาง", method),
      file,
      button,
    );
    paymentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      busy(button, true);
      try {
        let evidencePath = null;
        if (method.value === "transfer_demo") {
          if (!file.files[0]) throw new Error("กรุณาแนบหลักฐานตัวอย่าง");
          const data = new FormData();
          data.append("file", file.files[0]);
          evidencePath = (
            await api("/api/uploads", { method: "POST", body: data })
          ).path;
        }
        await api(`/api/bookings/${b.id}/payments`, {
          method: "POST",
          body: {
            amount: Number(amount.value),
            method: method.value,
            evidencePath,
          },
        });
        status(message, "ส่งการชำระจำลองให้ฝ่ายบัญชีตรวจแล้ว", "success");
        await loadBookings();
      } catch (error) {
        status(message, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
    actions.append(paymentForm);
  }
  if (
    ["held", "pending_review", "confirmed", "replacement_pending"].includes(
      b.status,
    )
  )
    actions.append(
      actionButton("ขอยกเลิกการจอง", async () => {
        if (!confirm("ยืนยันขอยกเลิกทั้งรายการจอง?")) return;
        const quote = await api(
          `/api/bookings/${b.id}/refund-quote?reason=guest_cancel`,
        );
        if (!confirm(`ยอดคืนจำลองตามเงื่อนไข: ${baht(quote.amount)} ยืนยันต่อหรือไม่?`))
          return;
        await api(`/api/bookings/${b.id}/cancel`, { method: "POST" });
        status(
          message,
          "บันทึกคำขอยกเลิกแล้ว รอฝ่ายบริหารพิจารณายอดคืนจำลอง",
          "success",
        );
      }),
    );
  if (["confirmed", "replacement_pending"].includes(b.status)) {
    const lateForm = node("form", "", "stack");
    const arrival = makeInput("arrival", "datetime-local");
    arrival.required = true;
    const button = node("button", "แจ้งมาถึงช้า", "btn btn-outline");
    button.type = "submit";
    lateForm.append(
      node("h3", "แจ้งมาถึงช้า"),
      formRow("คาดว่าจะถึง", arrival),
      button,
    );
    lateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      busy(button, true);
      try {
        await api(`/api/bookings/${b.id}/late-arrival`, {
          method: "POST",
          body: { expectedAt: new Date(arrival.value).toISOString() },
        });
        status(message, "บันทึกเวลาที่แจ้งแล้ว", "success");
      } catch (error) {
        status(message, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
    actions.append(lateForm);
  }
  for (const p of b.proposals.filter((x) => x.status === "pending")) {
    const box = node("div", "", "status info");
    box.append(node("strong", `เสนอห้องทดแทน ${p.code} โดยไม่เพิ่มราคา`));
    box.append(
      actionButton(
        "รับห้องนี้",
        async () => {
          await api(`/api/bookings/${b.id}/replacement-decision`, {
            method: "POST",
            body: { proposalId: p.id, accepted: true },
          });
          status(message, "รับห้องทดแทนแล้ว", "success");
        },
        "btn btn-primary",
      ),
      actionButton("ไม่รับและขอคืนเต็มจำนวน", async () => {
        await api(`/api/bookings/${b.id}/replacement-decision`, {
          method: "POST",
          body: { proposalId: p.id, accepted: false },
        });
        status(message, "บันทึกคำขอคืนเงินจำลองเต็มจำนวนแล้ว", "success");
      }),
    );
    actions.append(box);
  }
  for (const p of b.payments.filter((x) => x.status === "pending_review")) {
    const submitted = new Date(p.submittedAt).getTime();
    if (Date.now() - submitted >= 30 * 60000)
      actions.append(
        actionButton("ติดตามรายการที่รอตรวจเกิน 30 นาที", async () => {
          await api(`/api/payments/${p.id}/escalations`, { method: "POST" });
          status(message, "ส่งเรื่องให้ Superadmin ติดตามแล้ว", "success");
        }),
      );
  }
  if (["checked_in", "checked_out"].includes(b.status)) {
    const reviewForm = node("form", "", "stack");
    const rating = document.createElement("select");
    rating.id = "reviewRating";
    for (let n = 5; n >= 1; n--) {
      const option = node("option", `${n} ดาว`);
      option.value = String(n);
      rating.append(option);
    }
    const content = document.createElement("textarea");
    content.id = "reviewContent";
    content.required = true;
    content.maxLength = 2000;
    const button = node("button", "ส่งรีวิว", "btn btn-dark");
    button.type = "submit";
    reviewForm.append(
      node("h3", "เขียนรีวิว"),
      formRow("คะแนน", rating),
      formRow("ข้อความ", content),
      button,
    );
    reviewForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      busy(button, true);
      try {
        await api("/api/reviews", {
          method: "POST",
          body: {
            bookingId: b.id,
            rating: Number(rating.value),
            content: content.value,
          },
        });
        content.value = "";
        status(message, "ส่งรีวิวแล้ว", "success");
      } catch (error) {
        status(message, error.message, "error");
      } finally {
        busy(button, false);
      }
    });
    actions.append(reviewForm);
  }
  detailBox.append(actions);
  await renderTrips(b);
}
async function renderTrips(booking) {
  const panel = node("section", "", "panel trip-panel");
  panel.id = "trips";
  panel.style.marginTop = "1.5rem";
  panel.append(
    node("span", "NIGHT MARKET", "eyebrow"),
    node("h2", "ทริปตลาดกลางคืน"),
  );
  const past = node("div", "", "mini-list");
  for (const participant of booking.tours) {
    const row = node(
      "div",
      `${participant.participant_label} · ${dateLabel(participant.tourDate)} ${String(participant.timeLabel).slice(0, 5)} · ${baht(participant.price)} · ${participant.status === "cancelled" ? "ยกเลิกแล้ว" : "จองแล้ว"}`,
    );
    if (participant.status !== "cancelled") {
      const cancel = node("button", "ยกเลิกที่นั่ง", "btn btn-outline");
      cancel.type = "button";
      cancel.style.marginLeft = ".7rem";
      cancel.addEventListener("click", async () => {
        busy(cancel, true);
        try {
          await api(`/api/tours/participants/${participant.id}/cancel`, {
            method: "POST",
          });
          status(message, "ยกเลิกที่นั่งแล้ว ค่าทริปที่ชำระไม่คืนตามเงื่อนไข", "success");
          await loadBookings();
        } catch (error) {
          status(message, error.message, "error");
        } finally {
          busy(cancel, false);
        }
      });
      row.append(cancel);
    }
    past.append(row);
  }
  if (booking.tours.length) panel.append(node("h3", "ผู้ร่วมทริปที่จองไว้"), past);
  if (booking.status === "checked_in")
    panel.append(
      node(
        "p",
        "หากต้องการเพิ่มทริประหว่างเข้าพัก กรุณาติดต่อฝ่ายต้อนรับเพื่อชำระค่าทริปจำลองและยืนยันที่นั่งทันที",
        "subtle",
      ),
    );
  else if (["held", "pending_review", "confirmed"].includes(booking.status)) {
    const form = node("form", "", "stack");
    const date = makeInput(
      "tourDate",
      "date",
      String(booking.check_in).slice(0, 10),
    );
    date.min = String(booking.check_in).slice(0, 10);
    date.max = String(booking.check_out).slice(0, 10);
    const slot = document.createElement("select");
    slot.id = "tourSlot";
    slot.required = true;
    const participants = makeInput("tourParticipants");
    participants.required = true;
    participants.placeholder = "เช่น คุณอร, คุณนัท";
    const info = node("p", "", "subtle small");
    const loadSlots = async () => {
      slot.replaceChildren();
      if (
        date.value < String(booking.check_in).slice(0, 10) ||
        date.value >= String(booking.check_out).slice(0, 10)
      ) {
        info.textContent = "เลือกวันภายในช่วงเข้าพัก";
        return;
      }
      try {
        const slots = await api(`/api/tours/slots?date=${date.value}`);
        for (const item of slots) {
          const option = node(
            "option",
            `${item.time} · ว่าง ${item.available} ที่`,
          );
          option.value = String(item.id);
          option.disabled = item.available < 1;
          slot.append(option);
        }
        info.textContent = slots.some((x) => x.available > 0)
          ? "รอบแรก 15:00 น. · ครั้งแรก 50 บาทต่อคน ครั้งต่อไปวันเดียวกัน 20 บาท"
          : "รอบวันนี้เต็มแล้ว";
      } catch (error) {
        info.textContent = error.message;
      }
    };
    date.addEventListener("change", loadSlots);
    const submit = node("button", "จองที่นั่งทริป", "btn btn-primary");
    submit.type = "submit";
    form.append(
      formRow("วันที่", date),
      formRow("รอบ", slot),
      formRow("ชื่อหรือรหัสผู้ร่วม คั่นด้วยจุลภาค", participants),
      info,
      submit,
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      busy(submit, true);
      try {
        const names = participants.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (!names.length) throw new Error("กรุณาระบุผู้ร่วมทริป");
        const result = await api("/api/tours/reservations", {
          method: "POST",
          body: {
            bookingId: booking.id,
            slotId: Number(slot.value),
            participants: names,
          },
        });
        status(
          message,
          `จองรอบทริปแล้ว เพิ่มค่าทริปจำลอง ${baht(result.charge)} ในรายการจอง`,
          "success",
        );
        await loadBookings();
      } catch (error) {
        status(message, error.message, "error");
      } finally {
        busy(submit, false);
      }
    });
    panel.append(form);
    await loadSlots();
  }
  detailBox.append(panel);
  if (location.hash === "#trips") panel.scrollIntoView({ block: "start" });
}
async function loadChat() {
  if (!me) return;
  try {
    const messages = await api(`/api/chats/${me.id}/messages`);
    const target = document.querySelector("#chatLog");
    clear(target);
    if (!messages.length)
      target.append(node("p", "เริ่มต้นสนทนากับฝ่ายต้อนรับได้ที่นี่", "subtle"));
    for (const m of messages) {
      const box = node(
        "div",
        "",
        `chat-bubble${m.senderId === me.id ? " mine" : ""}`,
      );
      box.append(
        node("strong", m.senderId === me.id ? "คุณ" : "ฝ่ายต้อนรับ"),
        node("div", m.content),
      );
      target.append(box);
    }
    target.scrollTop = target.scrollHeight;
  } catch (error) {
    status(message, error.message, "error");
  }
}
document
  .querySelector("#loginForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    busy(button, true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: {
          email: document.querySelector("#loginEmail").value,
          password: document.querySelector("#loginPassword").value,
        },
      });
      if (params.get("next")) location.href = params.get("next");
      else await loadMe();
    } catch (error) {
      status(message, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
document
  .querySelector("#registerForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    busy(button, true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: {
          fullName: document.querySelector("#fullName").value,
          phone: document.querySelector("#phone").value,
          identityReference: document.querySelector("#identityReference").value,
          email: document.querySelector("#registerEmail").value,
          password: document.querySelector("#registerPassword").value,
        },
      });
      if (params.get("next")) location.href = params.get("next");
      else await loadMe();
    } catch (error) {
      status(message, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
document.querySelector("#logoutButton").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  clearInterval(chatTimer);
  me = null;
  selectedId = null;
  authSection.hidden = false;
  memberSection.hidden = true;
  status(message, "ออกจากระบบแล้ว", "success");
});
document
  .querySelector("#chatForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#chatMessage");
    const button = event.submitter;
    busy(button, true);
    try {
      await api(`/api/chats/${me.id}/messages`, {
        method: "POST",
        body: { content: input.value },
      });
      input.value = "";
      await loadChat();
    } catch (error) {
      status(message, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
document.addEventListener("tkc:authlost", () => {
  me = null;
  clearInterval(chatTimer);
  clear(detailBox);
  clear(list);
  memberSection.hidden = true;
  authSection.hidden = false;
});
loadMe();
