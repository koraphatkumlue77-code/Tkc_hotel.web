export const baht = (value) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
export const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(
        new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`),
      )
    : "—";
export const bookingStatusLabel = (value) =>
  ({
    held: "กันห้องไว้",
    pending_review: "รอตรวจชำระ",
    confirmed: "ยืนยันแล้ว",
    checked_in: "เข้าพักอยู่",
    checked_out: "เช็คเอาท์แล้ว",
    replacement_pending: "รอเลือกห้องทดแทน",
    cancelled: "ยกเลิกแล้ว",
    no_show: "ไม่เข้าพัก",
    approved: "อนุมัติแล้ว",
    rejected: "ไม่ผ่าน",
  })[value] || value;
export function node(tag, text = "", className = "") {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  return item;
}
export function clear(target) {
  target.replaceChildren();
}
export function status(target, message, kind = "info") {
  clear(target);
  if (message) target.append(node("div", message, `status ${kind}`));
}
export function busy(button, working) {
  button.disabled = working;
  button.dataset.label ||= button.textContent;
  if (working) button.textContent = "กำลังดำเนินการ…";
  else button.textContent = button.dataset.label;
}
export function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function setupNav() {
  const button = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  button?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
}
export function setupDateInputs(checkIn, checkOut) {
  const start = today();
  checkIn.min = start;
  checkIn.value ||= start;
  checkOut.min = shiftDate(checkIn.value, 1);
  checkOut.value ||= shiftDate(checkIn.value, 2);
  checkIn.addEventListener("change", () => {
    checkOut.min = shiftDate(checkIn.value, 1);
    if (checkOut.value <= checkIn.value) checkOut.value = checkOut.min;
  });
}
export function errorBlock(target, message, retry) {
  clear(target);
  const box = node("div", "", "status error");
  box.append(node("p", message));
  if (retry) {
    const button = node("button", "ลองอีกครั้ง", "btn btn-outline");
    button.type = "button";
    button.addEventListener("click", retry);
    box.append(button);
  }
  target.append(box);
}
