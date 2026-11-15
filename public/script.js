import {
  reservationSummary,
  roomImage,
  accountReturnPath,
  localAsset,
} from "./js/home-state.js";
import { api } from "./js/api.js";
import { baht, node, today, shiftDate, bookingStatusLabel } from "./js/ui.js";

const $ = (selector) => document.querySelector(selector);
const bookingDialog = $("#booking-dialog");
const loginDialog = $("#login-dialog");
const registerDialog = $("#register-dialog");
const resultDialog = $("#booking-result");
let me = null;
let roomTypes = [];
let attractions = [];
let selectedRooms = [];
let currentQuote = null;
let quoteVersion = 0;
let chatTimer = null;
let pendingBooking = null;
let reservations = reservationSummary([]);
let submitting = false;
const params = new URLSearchParams(location.search);

function show(dialog) {
  document.querySelectorAll("dialog[open]").forEach((item) => item.close());
  dialog.showModal();
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}
function errorAt(selector, message) {
  const el = $(selector);
  el.textContent = message || "";
  el.hidden = !message;
}
const defaultImage = roomImage;
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svg.namespaceURI, "use");
  const names = { arrow: "arrow-right", check: "check-circle-2", close: "x" };
  use.setAttribute("href", `/assets/icons.svg#${names[name] || name}`);
  svg.append(use);
  return svg;
}
function setIdentity(user) {
  me = user;
  const button = $('[data-login="ลูกค้า"]');
  button.querySelector("span").textContent = user?.fullName || "เข้าสู่ระบบ";
  $("#customer-sign-out").hidden = !user;
  if (!user) {
    reservations = reservationSummary([]);
    refreshIndicators();
    toggleChat(false);
  }
}
async function loadReservations() {
  if (me?.role !== "member") return;
  const userId = me.id;
  try {
    const rows = await api("/api/bookings/mine");
    const active = rows.filter(
      (b) =>
        [
          "held",
          "pending_review",
          "confirmed",
          "checked_in",
          "replacement_pending",
        ].includes(b.status) && b.checkOut >= today(),
    );
    const details = await Promise.all(
      active.map((b) => api(`/api/bookings/${b.id}`)),
    );
    if (me?.id !== userId) return;
    reservations = reservationSummary(details);
    refreshIndicators();
  } catch (error) {
    toast(`โหลดสถานะการจองไม่ได้: ${error.message}`);
  }
}
function refreshIndicators() {
  document.querySelectorAll("[data-room-booking]").forEach((button) => {
    const count = reservations.rooms[button.dataset.roomBooking] || 0;
    button.classList.toggle("is-booked", count > 0);
    const badge = button
      .closest(".room-card")
      .querySelector(".room-booking-status");
    badge.hidden = count === 0;
    badge.textContent = count ? `จองแล้ว ${count} ห้อง` : "";
    button.replaceChildren(
      document.createTextNode(count ? "จองเพิ่ม" : "จองห้องนี้"),
      icon(count ? "check" : "arrow"),
    );
  });
  for (const kind of ["fitness", "sauna"]) {
    const button = document.querySelector(`[data-facility="${kind}"]`);
    button.classList.toggle("is-booked", reservations[kind]);
    button.textContent = reservations[kind]
      ? "จองแล้ว · ดูรายละเอียด"
      : "จองบริการ";
  }
  const market = document.querySelector('[data-facility="market"]');
  market.classList.toggle("is-booked", reservations.tours > 0);
  market.textContent = reservations.tours
    ? `จองทริปแล้ว ${reservations.tours} ที่ · ดูรายละเอียด`
    : "ดูรายละเอียด";
}

async function loadIdentity() {
  try {
    setIdentity(await api("/api/me"));
  } catch (error) {
    if (error.status === 401) setIdentity(null);
  }
}
function beginLogin() {
  errorAt("#login-error-msg", "");
  show(loginDialog);
}
async function afterAuthentication() {
  await loadIdentity();
  if (me?.role !== "member") {
    location.href = `/staff/${me.role}.html`;
    return;
  }
  const next = accountReturnPath(params.get("next"));
  if (next) {
    location.href = next;
    return;
  }
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  await loadReservations();
  toast("เข้าสู่ระบบสำเร็จ");
  if (pendingBooking) {
    const pending = pendingBooking;
    pendingBooking = null;
    openBooking(pending.room, pending.facility);
  }
}

function dates() {
  return { checkIn: $("#checkin").value, checkOut: $("#checkout").value };
}
function setDateInputs() {
  $("#checkin").min = today();
  $("#checkin").value = shiftDate(today(), 1);
  $("#checkout").min = shiftDate($("#checkin").value, 1);
  $("#checkout").value = shiftDate($("#checkin").value, 2);
  $("#checkin").addEventListener("change", () => {
    $("#checkout").min = shiftDate($("#checkin").value, 1);
    if ($("#checkout").value <= $("#checkin").value)
      $("#checkout").value = $("#checkout").min;
  });
}
function makeRoomCard(room) {
  const card = node("article", "", "room-card");
  const image = document.createElement("img");
  image.className = "room-photo";
  image.loading = "lazy";
  image.width = 720;
  image.height = 540;
  image.src = defaultImage(room);
  image.alt = `ตัวอย่าง ${room.name}`;
  const info = node("div", "", "room-info");
  info.append(node("h3", room.name));
  const price = node("p", "", "price");
  price.append(
    node("strong", Number(room.nightlyPrice).toLocaleString("th-TH")),
    node("span", "บาท / คืน"),
  );
  const capacity = node("p", `พักได้สูงสุด ${room.capacity} คน`, "capacity");
  const booked = node("span", "", "room-booking-status");
  booked.hidden = true;
  capacity.append(booked);
  info.append(price, capacity);
  info.append(
    node(
      "p",
      room.description || "พื้นที่พักผ่อนพร้อมสิ่งอำนวยความสะดวกครบครัน",
      "details",
    ),
  );
  const amenity = node("div", "", "amenities");
  amenity.setAttribute("aria-label", "เตียงและสิ่งอำนวยความสะดวกเฉพาะห้อง");
  const roomAmenities = {
    1: [["เตียงควีนไซซ์", "bed-double"]],
    2: [["เตียงคิงไซซ์", "bed-double"]],
    3: [
      ["เตียงคิงไซซ์", "bed-double"],
      ["เครื่องชงกาแฟ", "coffee"],
    ],
    4: [
      ["เตียงสำหรับครอบครัว", "bed-double"],
      ["ตู้เย็นขนาดใหญ่", "refrigerator"],
    ],
  };
  for (const [label, name] of roomAmenities[Number(room.id)] || []) {
    const item = node("span");
    item.append(icon(name), document.createTextNode(label));
    amenity.append(item);
  }
  if (amenity.childElementCount) info.append(amenity);
  if (room.available !== undefined)
    info.append(
      node(
        "p",
        room.available ? `ว่าง ${room.available} ห้อง` : "เต็มในวันที่เลือก",
        "availability-note",
      ),
    );
  const button = node("button", "จองห้องนี้", "primary");
  button.dataset.roomBooking = room.id;
  button.type = "button";
  button.disabled = room.available === 0 || room.fitsGuests === false;
  button.addEventListener("click", () => openBooking(room));
  info.append(button);
  card.append(image, info);
  return card;
}
function showRooms(rooms, searched = false) {
  $("#room-grid").replaceChildren(...rooms.map(makeRoomCard));
  refreshIndicators();
  $("#empty-state").hidden = rooms.length > 0;
  $("#reset-search").hidden = !searched;
  $("#results-status").textContent = searched
    ? `พบ ${rooms.length} ประเภทห้องที่ตรงกับการค้นหา`
    : "เลือกห้องพักและวันที่ที่ต้องการได้เลย";
}
async function loadRooms() {
  try {
    roomTypes = await api("/api/rooms/types");
    showRooms(roomTypes);
  } catch (error) {
    $("#results-status").textContent = error.message;
  }
}
async function searchRooms(event) {
  event?.preventDefault();
  const { checkIn, checkOut } = dates();
  if (!checkIn || !checkOut || checkOut <= checkIn) {
    $("#search-error").textContent = "กรุณาเลือกวันเข้าพักและวันออกให้ถูกต้อง";
    return;
  }
  $("#search-error").textContent = "";
  try {
    const availability = await api(
      `/api/rooms/availability?${new URLSearchParams({ checkIn, checkOut, guests: $("#guests").value })}`,
    );
    const type = $("#room-type").value;
    const rows = availability.filter(
      (room) =>
        room.fitsGuests &&
        room.available > 0 &&
        (type === "all" || room.name.toLowerCase().startsWith(type)),
    );
    showRooms(rows, true);
    $("#rooms").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    $("#search-error").textContent = error.message;
  }
}
function bookingPayload() {
  return {
    checkIn: $("#modal-checkin").value,
    checkOut: $("#modal-checkout").value,
    rooms: selectedRooms.map(({ typeId, guests }) => ({ typeId, guests })),
    services: {
      breakfastDates: $("#modal-breakfast-checkbox").checked
        ? [
            ...document.querySelectorAll(
              "#breakfast-date-options input:checked",
            ),
          ].map((input) => input.value)
        : [],
      fitness: $("#booking-fitness").checked,
      sauna: $("#booking-sauna").checked,
    },
  };
}
function renderSelectedRooms() {
  const target = $("#selected-rooms");
  target.replaceChildren();
  selectedRooms.forEach((selection, index) => {
    const row = node("div", "", "selected-room-row");
    row.append(node("span", `ห้อง ${index + 1}`));
    const select = document.createElement("select");
    select.setAttribute("aria-label", `ประเภทห้อง ${index + 1}`);
    roomTypes.forEach((room) => {
      const option = new Option(room.name, room.id);
      select.append(option);
    });
    select.value = selection.typeId;
    select.addEventListener("change", () => {
      selection.typeId = Number(select.value);
      updateQuote();
    });
    row.append(select);
    const guestsLabel = node("label", "ผู้เข้าพัก", "room-guests");
    const guests = document.createElement("input");
    guests.type = "number";
    guests.min = "1";
    guests.max = String(
      roomTypes.find((room) => Number(room.id) === selection.typeId)
        ?.capacity || 1,
    );
    guests.required = true;
    guests.value = selection.guests;
    guests.setAttribute(
      "aria-label",
      `ผู้เข้าพักห้อง ${index + 1} (สูงสุด ${guests.max} คน)`,
    );
    guests.addEventListener("change", () => {
      selection.guests = Number(guests.value);
      updateQuote();
    });
    guestsLabel.append(guests);
    row.append(guestsLabel);
    if (selectedRooms.length > 1) {
      const remove = node("button", "ลบ");
      remove.type = "button";
      remove.addEventListener("click", () => {
        selectedRooms.splice(index, 1);
        updateQuote();
      });
      row.append(remove);
    }
    target.append(row);
  });
  $("#deposit-label").textContent =
    `มัดจำ ${selectedRooms.length === 1 ? 20 : 40}%`;
}
function renderBreakfastDates() {
  const target = $("#breakfast-date-options");
  target.replaceChildren();
  const { checkIn, checkOut } = bookingPayload();
  if (!checkIn || !checkOut || checkOut <= checkIn) return;
  let date = checkIn,
    count = 0;
  while (date < checkOut && count < 30) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = date;
    input.checked = true;
    input.addEventListener("change", updateQuote);
    label.append(input, document.createTextNode(` ${date}`));
    target.append(label);
    date = shiftDate(date, 1);
    count++;
  }
}
function updatePaymentAmount() {
  if (!currentQuote) {
    $("#modal-total-price").textContent = "—";
    return;
  }
  const full =
    document.querySelector('input[name="payment_choice"]:checked').value ===
    "full";
  $("#modal-total-price").textContent = Number(
    full ? currentQuote?.total : currentQuote?.depositDue || 0,
  ).toLocaleString("th-TH");
}
async function updateQuote({ resetDates = false } = {}) {
  renderSelectedRooms();
  if (resetDates) renderBreakfastDates();
  $("#breakfast-dates").hidden = !$("#modal-breakfast-checkbox").checked;
  const version = ++quoteVersion;
  currentQuote = null;
  updatePaymentAmount();
  $("#booking-form button[type=submit]").disabled = true;
  $("#booking-grand-total").textContent = "กำลังคำนวณ…";
  try {
    const payload = bookingPayload();
    const quote = await api("/api/bookings/quote", {
      method: "POST",
      body: { ...payload, ...payload.services },
    });
    if (version !== quoteVersion) return;
    currentQuote = quote;
    $("#booking-room-total").textContent = baht(quote.discountedRooms);
    $("#booking-breakfast-total").textContent = baht(quote.serviceSubtotal);
    $("#booking-grand-total").textContent = baht(quote.total);
    updatePaymentAmount();
    errorAt("#booking-error", "");
    $("#booking-form button[type=submit]").disabled = submitting;
  } catch (error) {
    if (version === quoteVersion) {
      $("#booking-grand-total").textContent = "คำนวณยอดไม่ได้";
      errorAt("#booking-error", error.message);
    }
  }
}

async function openBooking(room, facility) {
  if (submitting) return;
  if (!me || me.role !== "member") {
    pendingBooking = { room, facility };
    beginLogin();
    toast("กรุณาเข้าสู่ระบบสมาชิกก่อนจอง");
    return;
  }
  selectedRooms = [
    { typeId: Number(room.id), guests: Number($("#guests").value) },
  ];
  $("#modal-room-img").src = defaultImage(room);
  $("#modal-room-img").alt = `ตัวอย่าง ${room.name}`;
  $("#modal-room-name").textContent = room.name;
  $("#modal-room-subtext").textContent = `พักได้สูงสุด ${room.capacity} คน`;
  $("#modal-room-price").textContent = Number(room.nightlyPrice).toLocaleString(
    "th-TH",
  );
  $("#modal-checkin").min = today();
  $("#modal-checkin").value = $("#checkin").value;
  $("#modal-checkout").min = shiftDate($("#modal-checkin").value, 1);
  $("#modal-checkout").value = $("#checkout").value;
  $("#modal-breakfast-checkbox").checked = false;
  $("#booking-fitness").checked = facility === "fitness";
  $("#booking-sauna").checked = facility === "sauna";
  $("#slip-upload-input").value = "";
  $("#slip-file-name").textContent = "แนบหลักฐานการชำระ";
  document.querySelector(
    'input[name="payment_method"][value="online_demo"]',
  ).checked = true;
  $("#slip-label").hidden = true;
  $("#slip-upload-input").hidden = true;
  $("#slip-upload-input").required = false;
  $("#booking-online-row").hidden = false;
  $("#booking-bank-row").hidden = true;
  $("#booking-bank-channel").required = false;
  updatePaymentChannelGuide();
  document.querySelector(
    'input[name="payment_choice"][value="deposit"]',
  ).checked = true;
  renderBreakfastDates();
  show(bookingDialog);
  await updateQuote();
}
function showBookingResult(held, paymentSent, error) {
  $("#result-heading").textContent = paymentSent
    ? "รับรายการชำระแล้ว"
    : "กันห้องพักให้คุณแล้ว";
  $("#result-description").textContent = error
    ? `การจอง #${held.id} บันทึกแล้ว แต่ส่งรายการชำระไม่สำเร็จ: ${error.message} กรุณาชำระต่อในโปรไฟล์ ไม่ต้องจองใหม่`
    : paymentSent
      ? `การจอง #${held.id} อยู่ระหว่างตรวจสอบการชำระ ฝ่ายบัญชีจะยืนยันการจองหลังตรวจสอบยอดเรียบร้อย`
      : `การจอง #${held.id} รอชำระเงิน กรุณาชำระก่อน ${new Date(held.holdUntil).toLocaleString("th-TH")} เพื่อรักษาสิทธิ์ห้องพัก`;
  $("#result-account").href = `/account.html?bookingId=${held.id}`;
  const steps = resultDialog.querySelectorAll(".booking-lifecycle li");
  steps[0].className = "done";
  steps[1].className = paymentSent ? "current" : "";
  steps[2].className = "";
  show(resultDialog);
}
function confirmPayment(channel, amount) {
  const dialog = $("#payment-confirm");
  $("#payment-confirm-channel").textContent = channel;
  $("#payment-confirm-amount").textContent = baht(amount);
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    ),
  );
}
async function submitBooking(event) {
  event.preventDefault();
  if (submitting || !currentQuote) return;
  const button = event.submitter;
  const payload = bookingPayload();
  const method = document.querySelector(
    'input[name="payment_method"]:checked',
  ).value;
  const full =
    document.querySelector('input[name="payment_choice"]:checked').value ===
    "full";
  const file = $("#slip-upload-input").files[0];
  if (method === "transfer_demo" && !file) {
    errorAt("#booking-error", "กรุณาแนบหลักฐานการชำระ");
    return;
  }
  button.disabled = true;
  if (method !== "later") {
    const choice =
      method === "transfer_demo"
        ? $("#booking-bank-channel")
        : $("#booking-online-channel");
    const channel = `${method === "transfer_demo" ? "โอนผ่าน" : ""}${choice.selectedOptions[0].textContent}`;
    const confirmed = await confirmPayment(
      channel,
      Number(full ? currentQuote.total : currentQuote.depositDue),
    );
    if (!confirmed) {
      button.disabled = false;
      button.focus();
      return;
    }
  }
  submitting = true;
  $("#booking-form").setAttribute("aria-busy", "true");
  $("#booking-form").inert = true;
  button.textContent = "กำลังบันทึกการจอง…";
  let held;
  try {
    let evidencePath = null;
    if (method === "transfer_demo") {
      const form = new FormData();
      form.append("file", file);
      evidencePath = (await api("/api/uploads", { method: "POST", body: form }))
        .path;
    }
    held = await api("/api/bookings", { method: "POST", body: payload });
    if (method !== "later") {
      await api(`/api/bookings/${held.id}/payments`, {
        method: "POST",
        body: {
          amount: Number(full ? held.total : held.depositDue),
          method,
          channelDetail:
            method === "transfer_demo"
              ? $("#booking-bank-channel").value
              : $("#booking-online-channel").value,
          evidencePath,
        },
      });
    }
    currentQuote = null;
    showBookingResult(held, method !== "later");
    await loadReservations();
  } catch (error) {
    if (held) {
      currentQuote = null;
      showBookingResult(held, false, error);
      await loadReservations();
    } else errorAt("#booking-error", error.message);
  } finally {
    submitting = false;
    $("#booking-form").inert = false;
    $("#booking-form").removeAttribute("aria-busy");
    button.disabled = !currentQuote;
    button.textContent = "ยืนยันการจองและส่งการชำระ";
  }
}

async function loadReviews() {
  const target = $("#review-grid");
  try {
    const reviews = await api("/api/reviews");
    target.replaceChildren();
    if (!reviews.length) {
      $("#review-status").textContent =
        "ตัวอย่างการแสดงรีวิว — ยังไม่มีรีวิวจริงจากผู้เข้าพัก";
      reviews.push({
        rating: 5,
        content: "ตัวอย่างข้อความรีวิวจากผู้เข้าพัก",
        reviewerName: "ตัวอย่างรีวิว",
      });
    } else {
      $("#review-status").textContent = "รีวิวจากสมาชิกหลังเข้าพัก";
    }
    reviews.slice(0, 4).forEach((review) => {
      const card = document.createElement("blockquote");
      const stars = node("span", "", "stars");
      const rating = Math.max(
        0,
        Math.min(5, Math.round(Number(review.rating) || 0)),
      );
      for (let i = 0; i < 5; i++) {
        const star = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        star.setAttribute("viewBox", "0 0 24 24");
        star.setAttribute("aria-hidden", "true");
        if (i < rating) star.classList.add("is-filled");
        const polygon = document.createElementNS(star.namespaceURI, "polygon");
        polygon.setAttribute(
          "points",
          "12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3",
        );
        star.append(polygon);
        stars.append(star);
      }
      stars.setAttribute("role", "img");
      stars.setAttribute("aria-label", `${rating} จาก 5 ดาว`);
      card.append(
        stars,
        node("p", `“${review.content}”`),
        node("footer", review.reviewerName),
      );
      target.append(card);
    });
  } catch {
    $("#review-status").textContent = "ยังโหลดรีวิวไม่ได้";
  }
}
async function loadAttractions() {
  const target = $("#attraction-list");
  try {
    attractions = await api("/api/attractions");
    renderAttractions();
  } catch {
    resetAttractionControls();
    target.replaceChildren(node("p", "ยังโหลดสถานที่แนะนำไม่ได้"));
  }
}
function resetAttractionControls() {
  for (const id of ["#attraction-prev", "#attraction-next"]) {
    $(id).disabled = true;
    $(id).onclick = null;
  }
  $("#attraction-position").textContent = "0 / 0";
}
function renderAttractions() {
  resetAttractionControls();
  const season = $("#attraction-season").value;
  const rows = attractions.filter(
    (place) =>
      season === "all" || place.season === "all" || place.season === season,
  );
  const target = $("#attraction-list");
  target.replaceChildren();
  if (!rows.length) {
    target.append(node("p", "ยังไม่มีสถานที่แนะนำสำหรับฤดูนี้"));
    return;
  }
  const labels = {
    all: "ทุกฤดู",
    summer: "ฤดูร้อน",
    rainy: "ฤดูฝน",
    winter: "ฤดูหนาว",
  };
  function activate(index, scroll = true) {
    [...target.children].forEach((card, position) => {
      const active = position === index;
      card.classList.toggle("selected", active);
      card.setAttribute("aria-expanded", String(active));
      card.querySelector("p").hidden = !active;
    });
    $("#attraction-position").textContent = `${index + 1} / ${rows.length}`;
    $("#attraction-prev").disabled = index === 0;
    $("#attraction-next").disabled = index === rows.length - 1;
    if (scroll)
      target.children[index]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
  }
  rows.forEach((place, index) => {
    const card = node("button", "", "attraction-card");
    card.type = "button";
    card.setAttribute("aria-expanded", "false");
    const photo = document.createElement("img");
    photo.src = localAsset(
      place.image_url,
      place.name.includes("ตลาด")
        ? "/assets/night-market.jpg"
        : `/assets/season-${["summer", "rainy", "winter"].includes(place.season) ? place.season : "summer"}.jpg`,
    );
    photo.alt = `ภาพบรรยากาศประกอบ ${place.name}`;
    photo.loading = "lazy";
    card.append(photo);
    card.addEventListener("click", () => activate(index));
    const description = node("p", place.description);
    description.id = `attraction-description-${place.id}`;
    description.hidden = true;
    card.setAttribute("aria-controls", description.id);
    card.append(
      node("small", labels[place.season] || place.season, "attraction-season"),
      node("h4", place.name),
      description,
    );
    target.append(card);
  });
  $("#attraction-prev").onclick = () =>
    activate(
      Math.max(
        0,
        [...target.children].findIndex((card) =>
          card.classList.contains("selected"),
        ) - 1,
      ),
    );
  $("#attraction-next").onclick = () =>
    activate(
      Math.min(
        rows.length - 1,
        [...target.children].findIndex((card) =>
          card.classList.contains("selected"),
        ) + 1,
      ),
    );
  activate(0, false);
}
async function loadChat() {
  if (!me || me.role !== "member") return;
  try {
    const messages = await api(`/api/chats/${me.id}/messages`);
    const target = $("#chat-messages");
    target.replaceChildren();
    if (!messages.length)
      target.append(
        node("p", "สวัสดีค่ะ ยินดีต้อนรับสู่ TKC มีอะไรให้ช่วยไหมคะ?", "message staff"),
      );
    messages.forEach((message) =>
      target.append(
        node(
          "p",
          message.content,
          `message ${message.senderRole === "member" ? "customer" : "staff"}`,
        ),
      ),
    );
    if (messages.at(-1)?.senderRole === "member")
      target.append(node("p", "ส่งถึงระบบแล้ว รอฝ่ายต้อนรับตอบ", "chat-receipt"));
    target.scrollTop = target.scrollHeight;
  } catch (error) {
    toast(error.message);
  }
}
function toggleChat(open) {
  if (open && (!me || me.role !== "member")) {
    beginLogin();
    toast("กรุณาเข้าสู่ระบบสมาชิกก่อนเริ่มแชต");
    return;
  }
  $("#chat-panel").hidden = !open;
  $("#chat-toggle").setAttribute("aria-expanded", String(open));
  clearInterval(chatTimer);
  if (open) {
    loadChat();
    chatTimer = setInterval(loadChat, 10000);
    $("#chat-input").focus();
  }
}

$("#menu-toggle").addEventListener("click", () => {
  const nav = $("#main-nav");
  const open = nav.classList.toggle("open");
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
});
$("#main-nav").addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    $("#main-nav").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
  }
});
$("#search-form").addEventListener("submit", searchRooms);
$("#reset-search").addEventListener("click", () => {
  $("#room-type").value = "all";
  $("#room-type").dispatchEvent(new Event("change", { bubbles: true }));
  showRooms(roomTypes);
});
$("#empty-reset").addEventListener("click", () => {
  $("#room-type").value = "all";
  $("#room-type").dispatchEvent(new Event("change", { bubbles: true }));
  showRooms(roomTypes);
});
$('[data-login="ลูกค้า"]').addEventListener("click", () => {
  if (me?.role === "member") location.href = "/account.html";
  else if (me) location.href = `/staff/${me.role}.html`;
  else beginLogin();
});

document.querySelectorAll("[data-close]").forEach((button) =>
  button.addEventListener("click", () => {
    if (!submitting) button.closest("dialog").close();
  }),
);
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => {
    if (submitting) event.preventDefault();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && !submitting) dialog.close();
  });
});
$("#open-register-link").addEventListener("click", (event) => {
  event.preventDefault();
  show(registerDialog);
});
$("#back-to-login-link").addEventListener("click", (event) => {
  event.preventDefault();
  beginLogin();
});
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const user = await api("/api/auth/login", {
      method: "POST",
      body: {
        email: $("#login-email").value,
        password: $("#login-password").value,
      },
    });
    if (user.role !== "member") {
      location.href = `/staff/${user.role}.html`;
      return;
    }
    await afterAuthentication();
  } catch (error) {
    errorAt("#login-error-msg", error.message);
  } finally {
    button.disabled = false;
  }
});
$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("#reg-password").value !== $("#reg-confirm-password").value) {
    errorAt("#register-password-error", "รหัสผ่านไม่ตรงกัน");
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const identityReference = `${$("#reg-identity-type").value}:${$("#reg-identity-number").value}`;
    await api("/api/auth/register", {
      method: "POST",
      body: {
        fullName: $("#reg-fullname").value,
        email: $("#reg-email").value,
        phone: $("#reg-phone").value,
        identityReference,
        password: $("#reg-password").value,
      },
    });
    await afterAuthentication();
  } catch (error) {
    errorAt("#register-password-error", error.message);
  } finally {
    button.disabled = false;
  }
});
$("#customer-sign-out").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    await api("/api/auth/logout", { method: "POST" });
    setIdentity(null);
    toast("ออกจากระบบแล้ว");
  } catch (error) {
    toast(error.message);
  } finally {
    $("#customer-sign-out").disabled = false;
  }
});

$("#modal-checkin").addEventListener("change", () => {
  $("#modal-checkout").min = shiftDate($("#modal-checkin").value, 1);
  if ($("#modal-checkout").value <= $("#modal-checkin").value)
    $("#modal-checkout").value = $("#modal-checkout").min;
  updateQuote({ resetDates: true });
});
$("#modal-checkout").addEventListener("change", () =>
  updateQuote({ resetDates: true }),
);
$("#modal-breakfast-checkbox").addEventListener("change", () =>
  updateQuote({ resetDates: true }),
);
$("#booking-fitness").addEventListener("change", () => updateQuote());
$("#booking-sauna").addEventListener("change", () => updateQuote());
$("#add-booking-room").addEventListener("click", () => {
  if (selectedRooms.length >= 20) return;
  selectedRooms.push({ ...selectedRooms[0] });
  updateQuote();
});
document
  .querySelectorAll('input[name="payment_choice"]')
  .forEach((input) => input.addEventListener("change", updatePaymentAmount));
function updatePaymentChannelGuide() {
  const method = document.querySelector(
    'input[name="payment_method"]:checked',
  ).value;
  const guide = $("#booking-channel-guide");
  guide.hidden = method === "later";
  if (guide.hidden) return;
  const choice =
    method === "transfer_demo"
      ? $("#booking-bank-channel")
      : $("#booking-online-channel");
  const label = choice.selectedOptions[0]?.textContent || "";
  $("#booking-channel-title").textContent =
    method === "transfer_demo" ? "โอนผ่านธนาคาร" : label;
  $("#booking-channel-copy").textContent =
    method === "transfer_demo"
      ? "เลือกธนาคารผู้โอนและแนบหลักฐานเพื่อส่งตรวจสอบ"
      : "ตรวจสอบยอดและช่องทางก่อนส่งรายการ";
}
$("#booking-online-channel").addEventListener(
  "change",
  updatePaymentChannelGuide,
);
$("#booking-bank-channel").addEventListener(
  "change",
  updatePaymentChannelGuide,
);
document.querySelectorAll('input[name="payment_method"]').forEach((input) =>
  input.addEventListener("change", () => {
    const transfer = input.checked && input.value === "transfer_demo";
    $("#slip-label").hidden = !transfer;
    $("#slip-upload-input").hidden = !transfer;
    $("#slip-upload-input").required = transfer;
    $("#booking-bank-row").hidden = !transfer;
    $("#booking-bank-channel").required = transfer;
    $("#booking-online-row").hidden = input.value !== "online_demo";
    updatePaymentChannelGuide();
  }),
);
$("#slip-upload-input").addEventListener("change", () => {
  $("#slip-file-name").textContent =
    $("#slip-upload-input").files[0]?.name || "แนบหลักฐานการชำระ";
});
$("#booking-form").addEventListener("submit", submitBooking);
document.querySelectorAll("[data-facility]").forEach((button) =>
  button.addEventListener("click", () => {
    const kind = button.dataset.facility;
    if (["pool", "market"].includes(kind)) {
      const pool = kind === "pool";
      $("#experience-heading").textContent = pool ? "สระว่ายน้ำ" : "ตลาดกลางคืน";
      $("#experience-image").src = pool
        ? "/assets/hotel-pool.jpg"
        : "/assets/night-market.jpg";
      $("#experience-image").alt = pool
        ? "ภาพบรรยากาศสระว่ายน้ำ"
        : "ภาพบรรยากาศตลาดกลางคืน";
      $("#experience-description").textContent = pool
        ? "พักผ่อนริมสระว่ายน้ำ บริการรวมอยู่ในค่าห้องพักสำหรับผู้เข้าพักของโรงแรม สามารถสอบถามรอบและรายละเอียดเพิ่มเติมกับฝ่ายต้อนรับ"
        : "ค้นพบอาหารและบรรยากาศท้องถิ่นยามค่ำคืน ตรวจสอบวันเดินทาง รอบทริป และที่นั่งว่างก่อนจองผ่านโปรไฟล์ของคุณ";
      $("#experience-note").textContent =
        "ภาพประกอบบรรยากาศของโรงแรมและสถานที่ตัวอย่าง";
      $("#experience-action").hidden = pool;
      show($("#experience-dialog"));
      return;
    }
    if (reservations[kind]) {
      location.href = "/account.html";
      return;
    }
    if (!roomTypes.length) {
      toast("กำลังโหลดประเภทห้อง กรุณาลองอีกครั้ง");
      return;
    }
    openBooking(roomTypes[0], kind);
  }),
);

$("#chat-toggle").addEventListener("click", () =>
  toggleChat($("#chat-panel").hidden),
);
$("#chat-close").addEventListener("click", () => toggleChat(false));
document
  .querySelectorAll("[data-open-chat]")
  .forEach((button) =>
    button.addEventListener("click", () => toggleChat(true)),
  );
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chat-input");
  const content = input.value.trim();
  if (!content) return;
  try {
    await api(`/api/chats/${me.id}/messages`, {
      method: "POST",
      body: { content },
    });
    input.value = "";
    await loadChat();
    toast("ส่งข้อความแล้ว กำลังรอเจ้าหน้าที่ตอบ");
  } catch (error) {
    toast(error.message);
  }
});
$("#language").addEventListener("change", () => {
  $("#language").value = "th";
  toast("ขณะนี้เว็บไซต์ให้บริการภาษาไทย");
});
$("#attraction-season").addEventListener("change", renderAttractions);
document.addEventListener("tkc:authlost", () => setIdentity(null));
async function initialize() {
  setDateInputs();
  await Promise.all([
    loadIdentity(),
    loadRooms(),
    loadReviews(),
    loadAttractions(),
  ]);
  await loadReservations();
  if (params.has("login") && !me) beginLogin();
  if (params.has("login") && me) {
    if (me.role !== "member") location.href = `/staff/${me.role}.html`;
    else if (accountReturnPath(params.get("next")))
      location.href = accountReturnPath(params.get("next"));
  }
  for (const [key, selector] of [
    ["checkIn", "#checkin"],
    ["checkOut", "#checkout"],
  ]) {
    const value = params.get(key);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || "") && value >= today())
      $(selector).value = value;
  }
  const guests = params.get("guests");
  if (["1", "2", "3", "4", "5", "6"].includes(guests)) {
    $("#guests").value = guests;
    $("#guests").dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (params.has("book") && roomTypes.length)
    openBooking(
      roomTypes.find(
        (room) => Number(room.id) === Number(params.get("typeId")),
      ) || roomTypes[0],
    );
}
const navLinks = [...document.querySelectorAll("#main-nav a")];
function setActiveSection(id) {
  navLinks.forEach((link) => {
    const active = link.hash === `#${id}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}
let scrollQueued = false;
function updateSection() {
  const position =
    window.scrollY + document.querySelector(".site-header").offsetHeight + 100;
  let active = "home";
  for (const link of navLinks) {
    const section = document.querySelector(link.hash);
    if (section && section.offsetTop <= position) active = section.id;
  }
  if (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 5
  )
    active = "contact";
  setActiveSection(active);
  scrollQueued = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(updateSection);
    }
  },
  { passive: true },
);
navLinks.forEach((link) =>
  link.addEventListener("click", () => setActiveSection(link.hash.slice(1))),
);
const heroVideo = $("#hero-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function syncHeroPlayback() {
  heroVideo.muted = true;
  if (reducedMotion.matches || document.hidden) heroVideo.pause();
  else heroVideo.play().catch(() => {});
}
reducedMotion.addEventListener("change", syncHeroPlayback);
heroVideo.addEventListener("loadedmetadata", syncHeroPlayback);
syncHeroPlayback();
document.addEventListener("visibilitychange", () => {
  syncHeroPlayback();
  if (!document.hidden) loadReservations();
});
initialize();
