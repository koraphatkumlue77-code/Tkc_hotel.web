import { api, ApiError } from "./api.js";
import { baht, node, today, shiftDate, bookingStatusLabel } from "./ui.js";

const $ = (selector) => document.querySelector(selector);
const bookingDialog = $("#booking-dialog");
const loginDialog = $("#login-dialog");
const registerDialog = $("#register-dialog");
const bookingsDialog = $("#my-bookings-dialog");
let me = null;
let roomTypes = [];
let attractions = [];
let selectedRooms = [];
let currentQuote = null;
let quoteVersion = 0;
let chatTimer = null;
let loginIntent = "customer";

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
function defaultImage(room) {
  return (
    room.imageUrl ||
    (room.name?.toLowerCase().includes("family")
      ? "/assets/room-family.jpg"
      : "/assets/room-standard.jpg")
  );
}
function setIdentity(user) {
  me = user;
  $("#my-bookings-button").hidden = !user || user.role !== "member";
  const button = $('[data-login="ลูกค้า"]');
  button.querySelector("span").textContent =
    user?.role === "member" ? user.fullName : "เข้าสู่ระบบ";
  button.hidden = Boolean(user && user.role !== "member");
}
async function loadIdentity() {
  try {
    setIdentity(await api("/api/me"));
  } catch (error) {
    if (error.status === 401) setIdentity(null);
  }
}
function beginLogin(intent = "customer") {
  loginIntent = intent;
  $("#login-title").textContent =
    intent === "staff" ? "เข้าสู่ระบบพนักงาน" : "เข้าสู่ระบบ";
  $("#register-link-wrapper").hidden = intent === "staff";
  errorAt("#login-error-msg", "");
  show(loginDialog);
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
  image.src = defaultImage(room);
  image.alt = `ตัวอย่าง ${room.name}`;
  const info = node("div", "", "room-info");
  info.append(node("h3", room.name));
  const price = node("p", "", "price");
  price.append(
    node("strong", Number(room.nightlyPrice).toLocaleString("th-TH")),
    node("span", "บาท / คืน"),
  );
  info.append(price, node("p", `พักได้สูงสุด ${room.capacity} คน`, "capacity"));
  info.append(
    node(
      "p",
      room.description || "พื้นที่พักผ่อนพร้อมสิ่งอำนวยความสะดวกครบครัน",
      "details",
    ),
  );
  const amenity = node("div", "", "amenities");
  amenity.append(
    node("span", "ห้องน้ำส่วนตัว"),
    node("span", "Wi-Fi"),
    node("span", "เครื่องปรับอากาศ"),
  );
  info.append(amenity);
  if (room.available !== undefined)
    info.append(
      node(
        "p",
        room.available ? `ว่าง ${room.available} ห้อง` : "เต็มในวันที่เลือก",
        "availability-note",
      ),
    );
  const button = node("button", "จองห้องนี้ ↗", "primary");
  button.type = "button";
  button.disabled = room.available === 0 || room.fitsGuests === false;
  button.addEventListener("click", () => openBooking(room));
  info.append(button);
  card.append(image, info);
  return card;
}
function showRooms(rooms, searched = false) {
  $("#room-grid").replaceChildren(...rooms.map(makeRoomCard));
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
    rooms: selectedRooms.map((typeId) => ({
      typeId: Number(typeId),
      guests: Math.min(
        Number($("#guests").value),
        Number(
          roomTypes.find((room) => Number(room.id) === Number(typeId))
            ?.capacity || 1,
        ),
      ),
    })),
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
  selectedRooms.forEach((typeId, index) => {
    const row = node("div", "", "selected-room-row");
    row.append(node("span", `ห้อง ${index + 1}`));
    const select = document.createElement("select");
    select.setAttribute("aria-label", `ประเภทห้อง ${index + 1}`);
    roomTypes.forEach((room) => {
      const option = new Option(room.name, room.id);
      select.append(option);
    });
    select.value = typeId;
    select.addEventListener("change", () => {
      selectedRooms[index] = Number(select.value);
      updateQuote();
    });
    row.append(select);
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
  try {
    const payload = bookingPayload();
    currentQuote = await api("/api/bookings/quote", {
      method: "POST",
      body: { ...payload, ...payload.services },
    });
    if (version !== quoteVersion) return;
    $("#booking-room-total").textContent = baht(currentQuote.discountedRooms);
    $("#booking-breakfast-total").textContent = baht(
      currentQuote.serviceSubtotal,
    );
    $("#booking-grand-total").textContent = baht(currentQuote.total);
    updatePaymentAmount();
    errorAt("#booking-error", "");
  } catch (error) {
    if (version === quoteVersion) {
      currentQuote = null;
      errorAt("#booking-error", error.message);
    }
  }
}
async function openBooking(room, facility) {
  if (!me || me.role !== "member") {
    beginLogin();
    toast("กรุณาเข้าสู่ระบบสมาชิกก่อนจอง");
    return;
  }
  selectedRooms = [Number(room.id)];
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
  $("#slip-file-name").textContent = "อัปโหลดรูปหลักฐานตัวอย่าง";
  document.querySelector(
    'input[name="payment_method"][value="online_demo"]',
  ).checked = true;
  $("#slip-label").hidden = true;
  $("#slip-upload-input").hidden = true;
  $("#slip-upload-input").required = false;
  document.querySelector(
    'input[name="payment_choice"][value="deposit"]',
  ).checked = true;
  renderBreakfastDates();
  show(bookingDialog);
  await updateQuote();
}
async function submitBooking(event) {
  event.preventDefault();
  const button = event.submitter;
  if (!currentQuote) {
    errorAt("#booking-error", "กรุณาตรวจสอบข้อมูลการจอง");
    return;
  }
  const method = document.querySelector(
    'input[name="payment_method"]:checked',
  ).value;
  const file = $("#slip-upload-input").files[0];
  if (method === "transfer_demo" && !file) {
    errorAt("#booking-error", "กรุณาแนบรูปหลักฐานตัวอย่าง");
    return;
  }
  button.disabled = true;
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
    held = await api("/api/bookings", {
      method: "POST",
      body: bookingPayload(),
    });
    const amount = Number(
      document.querySelector('input[name="payment_choice"]:checked').value ===
        "full"
        ? held.total
        : held.depositDue,
    );
    await api(`/api/bookings/${held.id}/payments`, {
      method: "POST",
      body: { amount, method, evidencePath },
    });
    bookingDialog.close();
    toast(`บันทึกการจอง #${held.id} แล้ว อยู่ระหว่างฝ่ายบัญชีตรวจการชำระจำลอง`);
    await showMyBookings();
  } catch (error) {
    errorAt(
      "#booking-error",
      held
        ? `กันห้อง #${held.id} แล้ว แต่ส่งรายการชำระไม่สำเร็จ: ${error.message} เปิดรายการจองของฉันเพื่อลองอีกครั้ง`
        : error.message,
    );
  } finally {
    button.disabled = false;
    button.textContent = "กันห้องและส่งการชำระจำลอง";
  }
}
async function showMyBookings() {
  if (!me || me.role !== "member") {
    beginLogin();
    return;
  }
  const target = $("#my-bookings-list");
  target.replaceChildren(node("p", "กำลังโหลดรายการจอง…"));
  show(bookingsDialog);
  try {
    const rows = await api("/api/bookings/mine");
    target.replaceChildren();
    if (!rows.length) {
      target.append(node("p", "ยังไม่มีรายการจอง"));
      return;
    }
    rows.forEach((booking) => {
      const card = node("div", "", "my-booking-item");
      card.append(
        node(
          "strong",
          `การจอง #${booking.id} · ${bookingStatusLabel(booking.status)}`,
        ),
        node(
          "p",
          `${booking.checkIn} ถึง ${booking.checkOut} · ${baht(booking.total)}`,
        ),
      );
      const link = node("a", "ดูรายละเอียดและจัดการการจอง ↗");
      link.href = `/account.html?bookingId=${booking.id}`;
      card.append(link);
      target.append(card);
    });
  } catch (error) {
    target.replaceChildren(node("p", error.message));
  }
}
async function loadReviews() {
  const target = $("#review-grid");
  try {
    const reviews = await api("/api/reviews");
    target.replaceChildren();
    if (!reviews.length) {
      $("#review-status").textContent = "ยังไม่มีรีวิวจากผู้เข้าพัก";
      return;
    }
    $("#review-status").textContent = "รีวิวจากสมาชิกหลังเข้าพัก";
    reviews.slice(0, 4).forEach((review) => {
      const card = document.createElement("blockquote");
      const stars = node("span", "★".repeat(review.rating), "stars");
      stars.setAttribute("aria-label", `${review.rating} ดาว`);
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
    target.replaceChildren(node("p", "ยังโหลดสถานที่แนะนำไม่ได้"));
  }
}
function renderAttractions() {
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
  rows.forEach((place) => {
    const card = node("article", "", "attraction-card");
    card.append(
      node("small", labels[place.season] || place.season, "attraction-season"),
      node("h4", place.name),
      node("p", place.description),
    );
    target.append(card);
  });
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
  showRooms(roomTypes);
});
$("#empty-reset").addEventListener("click", () => {
  $("#room-type").value = "all";
  showRooms(roomTypes);
});
document
  .querySelectorAll("[data-login]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      beginLogin(button.dataset.login === "พนักงาน" ? "staff" : "customer"),
    ),
  );
$("#my-bookings-button").addEventListener("click", showMyBookings);
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }),
);
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
    if (loginIntent === "staff") {
      await api("/api/auth/logout", { method: "POST" });
      throw new Error("บัญชีนี้เป็นสมาชิก กรุณาใช้ปุ่มเข้าสู่ระบบลูกค้า");
    }
    await loadIdentity();
    loginDialog.close();
    toast("เข้าสู่ระบบสำเร็จ");
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
    await loadIdentity();
    registerDialog.close();
    toast("สมัครสมาชิกสำเร็จ");
  } catch (error) {
    errorAt("#register-password-error", error.message);
  } finally {
    button.disabled = false;
  }
});
$("#customer-sign-out").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  setIdentity(null);
  bookingsDialog.close();
  toggleChat(false);
  toast("ออกจากระบบแล้ว");
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
  selectedRooms.push(selectedRooms[0]);
  updateQuote();
});
document
  .querySelectorAll('input[name="payment_choice"]')
  .forEach((input) => input.addEventListener("change", updatePaymentAmount));
document.querySelectorAll('input[name="payment_method"]').forEach((input) =>
  input.addEventListener("change", () => {
    const transfer = input.checked && input.value === "transfer_demo";
    $("#slip-label").hidden = !transfer;
    $("#slip-upload-input").hidden = !transfer;
    $("#slip-upload-input").required = transfer;
  }),
);
$("#slip-upload-input").addEventListener("change", () => {
  $("#slip-file-name").textContent =
    $("#slip-upload-input").files[0]?.name || "อัปโหลดรูปหลักฐานตัวอย่าง";
});
$("#booking-form").addEventListener("submit", submitBooking);
document.querySelectorAll("[data-facility]").forEach((button) =>
  button.addEventListener("click", () => {
    const facility = button.dataset.facility;
    if (facility === "pool") {
      toast("สระว่ายน้ำรวมอยู่ในค่าห้องพัก");
      return;
    }
    if (facility === "market") {
      location.href = "/account.html#trips";
      return;
    }
    if (!roomTypes.length) {
      toast("กำลังโหลดประเภทห้อง กรุณาลองอีกครั้ง");
      return;
    }
    openBooking(roomTypes[0], facility);
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
setDateInputs();
loadIdentity();
loadRooms();
loadReviews();
loadAttractions();
