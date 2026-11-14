import { api, ApiError } from "./api.js";
import {
  baht,
  node,
  clear,
  status,
  busy,
  setupNav,
  setupDateInputs,
  shiftDate,
  dateLabel,
} from "./ui.js";
setupNav();
const params = new URLSearchParams(location.search);
const form = document.querySelector("#bookingForm");
const checkIn = document.querySelector("#checkIn"),
  checkOut = document.querySelector("#checkOut");
checkIn.value = params.get("checkIn") || "";
checkOut.value = params.get("checkOut") || "";
setupDateInputs(checkIn, checkOut);
const choices = document.querySelector("#roomChoices"),
  breakfastBox = document.querySelector("#breakfastDates"),
  summary = document.querySelector("#quoteSummary"),
  message = document.querySelector("#bookingStatus");
let types = [],
  quote = null,
  booking = null,
  quoteTimer,
  submitting = false;
function selectedRooms() {
  return types.flatMap((type) => {
    const count = Number(
      document.querySelector(`#count-${type.id}`)?.value || 0,
    );
    const guests = Number(
      document.querySelector(`#guests-${type.id}`)?.value || 1,
    );
    return Array.from({ length: count }, () => ({ typeId: type.id, guests }));
  });
}
function selectedDates() {
  return [...breakfastBox.querySelectorAll("input:checked")].map(
    (input) => input.value,
  );
}
function payload() {
  return {
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    rooms: selectedRooms(),
    breakfastDates: selectedDates(),
    fitness: document.querySelector("#fitness").checked,
    sauna: document.querySelector("#sauna").checked,
  };
}
function renderBreakfast() {
  const previous = new Set(selectedDates());
  clear(breakfastBox);
  if (!checkIn.value || !checkOut.value || checkOut.value <= checkIn.value)
    return;
  for (
    let date = checkIn.value;
    date < checkOut.value;
    date = shiftDate(date, 1)
  ) {
    const wrapper = node("label", "", "choice");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = date;
    input.checked = previous.has(date);
    input.addEventListener("change", queueQuote);
    wrapper.append(input, node("span", dateLabel(date)));
    breakfastBox.append(wrapper);
  }
}
function renderChoices() {
  clear(choices);
  for (const type of types) {
    const row = node("div", "", "booking-room-row");
    const title = node("div");
    title.append(
      node("strong", type.name),
      node(
        "div",
        `${baht(type.nightlyPrice)} / คืน · สูงสุด ${type.capacity} ท่าน`,
        "subtle small",
      ),
    );
    const countWrap = node("div");
    const countLabel = node("label", "ห้อง");
    countLabel.htmlFor = `count-${type.id}`;
    const count = node("select");
    count.id = `count-${type.id}`;
    for (let i = 0; i <= 5; i++) {
      const option = node("option", String(i));
      option.value = String(i);
      count.append(option);
    }
    if (Number(params.get("typeId")) === Number(type.id)) count.value = "1";
    count.addEventListener("change", queueQuote);
    countWrap.append(countLabel, count);
    const guestWrap = node("div");
    const guestLabel = node("label", "คน/ห้อง");
    guestLabel.htmlFor = `guests-${type.id}`;
    const guest = node("select");
    guest.id = `guests-${type.id}`;
    for (let i = 1; i <= type.capacity; i++) {
      const option = node("option", String(i));
      option.value = String(i);
      guest.append(option);
    }
    guest.value = String(Math.min(2, type.capacity));
    guest.addEventListener("change", queueQuote);
    guestWrap.append(guestLabel, guest);
    row.append(title, countWrap, guestWrap);
    choices.append(row);
  }
}
function showQuote() {
  clear(summary);
  if (!quote) {
    summary.append(node("p", "เลือกห้องและวันที่เพื่อดูราคา", "subtle"));
    return;
  }
  summary.append(
    node(
      "div",
      `${quote.rooms.length} ห้อง · ${quote.nights} คืน`,
      "subtle small",
    ),
  );
  const lines = [
    ["ค่าห้อง", quote.roomSubtotal],
    ...quote.discounts.map((d) => [
      `ส่วนลด ${d.name || `${d.percent}%`}`,
      -d.amount,
    ]),
    ["บริการเพิ่มเติม", quote.serviceSubtotal],
  ];
  for (const [label, value] of lines) {
    const line = node("div", "", "price-line");
    line.append(
      node("span", label),
      node("strong", `${value < 0 ? "-" : ""}${baht(Math.abs(value))}`),
    );
    summary.append(line);
  }
  const total = node("div", "", "price-line total");
  total.append(node("span", "ยอดรวม"), node("strong", baht(quote.total)));
  summary.append(total);
  const deposit = node("div", "", "price-line");
  deposit.append(
    node("span", "มัดจำขั้นต่ำ"),
    node("strong", baht(quote.depositDue)),
  );
  summary.append(deposit);
}
async function updateQuote() {
  if (!selectedRooms().length) {
    quote = null;
    showQuote();
    return;
  }
  try {
    quote = await api("/api/bookings/quote", {
      method: "POST",
      body: payload(),
    });
    status(message, "");
    showQuote();
  } catch (error) {
    quote = null;
    showQuote();
    status(message, error.message, "error");
  }
}
function queueQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(updateQuote, 180);
}
for (const input of [checkIn, checkOut])
  input.addEventListener("change", () => {
    renderBreakfast();
    queueQuote();
  });
for (const input of [
  document.querySelector("#fitness"),
  document.querySelector("#sauna"),
])
  input.addEventListener("change", queueQuote);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  submitting = true;
  const button = document.querySelector("#holdButton");
  busy(button, true);
  try {
    if (!quote) await updateQuote();
    if (!quote) throw new Error("กรุณาเลือกห้องและวันที่ให้ถูกต้อง");
    await api("/api/me");
    booking = await api("/api/bookings", {
      method: "POST",
      body: {
        ...payload(),
        services: {
          breakfastDates: selectedDates(),
          fitness: document.querySelector("#fitness").checked,
          sauna: document.querySelector("#sauna").checked,
        },
      },
    });
    form.hidden = true;
    document.querySelector("#paymentPanel").hidden = false;
    document.querySelector("#bookingCode").textContent = `#${booking.id}`;
    document.querySelector("#holdUntil").textContent =
      `กันห้องถึง ${new Date(booking.holdUntil).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น.`;
    document.querySelector("#paymentAmount").value = booking.depositDue;
    document.querySelector("#paymentAmount").max = booking.total;
    status(message, "กันห้องแล้ว กรุณาส่งการชำระแบบจำลอง", "success");
    scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const link = node("a", "เข้าสู่ระบบก่อนจอง →", "text-link");
      link.href = `/account.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      status(message, "กรุณาเข้าสู่ระบบสมาชิกก่อนจอง", "error");
      message.firstElementChild.append(" ", link);
    } else status(message, error.message, "error");
  } finally {
    submitting = false;
    busy(button, false);
  }
});
const paymentMethod = document.querySelector("#paymentMethod");
paymentMethod.addEventListener(
  "change",
  () =>
    (document.querySelector("#evidenceField").hidden =
      paymentMethod.value !== "transfer_demo"),
);
document
  .querySelector("#paymentForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    busy(button, true);
    try {
      let evidencePath = null;
      if (paymentMethod.value === "transfer_demo") {
        const file = document.querySelector("#evidence").files[0];
        if (!file) throw new Error("กรุณาแนบหลักฐานตัวอย่าง");
        const data = new FormData();
        data.append("file", file);
        evidencePath = (
          await api("/api/uploads", { method: "POST", body: data })
        ).path;
      }
      await api(`/api/bookings/${booking.id}/payments`, {
        method: "POST",
        body: {
          amount: Number(document.querySelector("#paymentAmount").value),
          method: paymentMethod.value,
          evidencePath,
        },
      });
      status(
        message,
        "ส่งรายการจำลองแล้ว รอฝ่ายบัญชีตรวจสอบ คุณติดตามได้ในบัญชีของฉัน",
        "success",
      );
      document.querySelector("#paymentPanel").hidden = true;
      const link = node("a", "ดูการจองของฉัน →", "btn btn-dark");
      link.href = `/account.html?bookingId=${booking.id}`;
      message.append(link);
    } catch (error) {
      status(message, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
async function init() {
  try {
    types = await api("/api/rooms/types");
    renderChoices();
    renderBreakfast();
    queueQuote();
  } catch (error) {
    status(message, error.message, "error");
    choices.replaceChildren(
      node("p", "โหลดประเภทห้องไม่ได้ กรุณารีเฟรชหน้า", "status error"),
    );
  }
}
init();
