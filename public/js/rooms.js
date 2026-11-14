import { api } from "./api.js";
import {
  baht,
  node,
  clear,
  status,
  errorBlock,
  setupNav,
  setupDateInputs,
} from "./ui.js";
setupNav();
const params = new URLSearchParams(location.search);
const form = document.querySelector("#roomSearch");
const checkIn = form.querySelector("#checkIn"),
  checkOut = form.querySelector("#checkOut"),
  guests = form.querySelector("#guests");
checkIn.value = params.get("checkIn") || "";
checkOut.value = params.get("checkOut") || "";
guests.value = params.get("guests") || 2;
setupDateInputs(checkIn, checkOut);
const statusBox = document.querySelector("#searchStatus"),
  results = document.querySelector("#roomResults");
function roomCard(room, hasDates) {
  const card = node("article", "", "room-card");
  const image = document.createElement("img");
  image.src = room.imageUrl || "/assets/room-standard.jpg";
  image.alt = `ตัวอย่างห้อง ${room.name}`;
  const body = node("div", "", "body");
  const meta = node("div", "", "meta");
  meta.append(
    node("span", `ห้อง ${room.name}`),
    node("span", `สูงสุด ${room.capacity} ท่าน`),
  );
  body.append(
    meta,
    node("h3", room.name, "serif"),
    node("p", room.description || "สัมผัสความสบายในทุกคืนที่เข้าพัก", "subtle"),
  );
  if (hasDates)
    body.append(
      node(
        "p",
        room.available > 0
          ? `ว่าง ${room.available} ห้องในช่วงวันที่เลือก`
          : "เต็มในช่วงวันที่เลือก",
        room.available > 0 ? "badge" : "status error",
      ),
    );
  const foot = node("div", "", "foot");
  foot.append(node("span", `${baht(room.nightlyPrice)} / คืน`, "price"));
  const link = node(
    "a",
    "เลือกห้องนี้ →",
    `btn ${room.available === 0 ? "btn-outline" : "btn-primary"}`,
  );
  link.href = `/booking.html?checkIn=${encodeURIComponent(checkIn.value)}&checkOut=${encodeURIComponent(checkOut.value)}&typeId=${room.id}`;
  if (hasDates && (!room.available || !room.fitsGuests)) {
    link.setAttribute("aria-disabled", "true");
    link.addEventListener("click", (event) => event.preventDefault());
  }
  foot.append(link);
  body.append(foot);
  card.append(image, body);
  return card;
}
async function load() {
  clear(results);
  status(statusBox, "กำลังค้นหาห้องว่าง…");
  const hasDates = Boolean(checkIn.value && checkOut.value);
  if (hasDates && checkOut.value <= checkIn.value) {
    status(statusBox, "วันออกต้องอยู่หลังวันเข้าพัก", "error");
    return;
  }
  try {
    const rooms = hasDates
      ? await api(
          `/api/rooms/availability?${new URLSearchParams({ checkIn: checkIn.value, checkOut: checkOut.value, guests: guests.value })}`,
        )
      : await api("/api/rooms/types");
    const filtered = rooms.filter((room) => !hasDates || room.fitsGuests);
    clear(statusBox);
    document.querySelector("#resultCount").textContent =
      `${filtered.filter((room) => !hasDates || room.available > 0).length} ประเภทห้อง`;
    if (
      !filtered.length ||
      (hasDates && !filtered.some((room) => room.available > 0))
    ) {
      status(
        statusBox,
        "ไม่พบห้องว่างสำหรับวันที่และจำนวนคนนี้ ลองเปลี่ยนวันหรือจำนวนผู้เข้าพัก",
        "info",
      );
    }
    results.replaceChildren(
      ...filtered.map((room) => roomCard(room, hasDates)),
    );
  } catch (error) {
    errorBlock(statusBox, error.message, load);
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  history.replaceState(
    null,
    "",
    `/rooms.html?${new URLSearchParams({ checkIn: checkIn.value, checkOut: checkOut.value, guests: guests.value })}`,
  );
  load();
});
load();
