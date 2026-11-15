import { api } from "./api.js";
import {
  baht,
  node,
  clear,
  status,
  busy,
  setupNav,
  dateLabel,
  bookingStatusLabel,
  shiftDate,
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
  chatTimer = null,
  detailRequest = 0,
  chatSnapshot = "",
  chatOpen = false,
  chatSession = 0,
  bookingsCache = [],
  bookingFilter = "all",
  bookingListRequest = 0,
  noticeTimer = null;
function notify(text, kind = "info") {
  clearTimeout(noticeTimer);
  status(message, text, kind);
  if (kind === "success")
    noticeTimer = setTimeout(() => status(message, ""), 5000);
}
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `/assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}
const statusLabel = (value) =>
  value === "expired" ? "หมดเวลากันห้อง" : bookingStatusLabel(value);
const paymentMethod = (value) =>
  ({
    online_demo: "ออนไลน์",
    transfer_demo: "โอนเงิน",
    reception_demo: "เคาน์เตอร์ต้อนรับ",
  })[value] || "ช่องทางอื่น";
const channelLabel = (value) =>
  ({
    credit: "บัตรเครดิต",
    debit: "บัตรเดบิต",
    paypal: "PayPal",
    bbl: "กรุงเทพ",
    kbank: "กสิกรไทย",
    scb: "ไทยพาณิชย์",
    ktb: "กรุงไทย",
    other: "ธนาคารอื่น",
  })[value] || "";
const serviceLabel = (value) =>
  ({
    breakfast: "อาหารเช้า",
    fitness: "ฟิตเนส",
    sauna: "ซาวน่า",
    tour: "ทริปตลาดกลางคืน",
  })[value] || value;
const timeLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(value))
    : "—";
function signIn() {
  const next = `/account.html${location.search}${location.hash}`;
  location.replace(`/?login=1&next=${encodeURIComponent(next)}`);
}
async function loadMe() {
  try {
    me = await api("/api/me");
    if (me.role !== "member") {
      const roles = [
        "reception",
        "accounting",
        "management",
        "housekeeping",
        "superadmin",
      ];
      location.replace(
        roles.includes(me.role) ? `/staff/${me.role}.html` : "/",
      );
      return;
    }
    authSection.hidden = true;
    memberSection.hidden = false;
    document.querySelector("#welcomeName").textContent = `สวัสดี ${me.fullName}`;
    document.querySelector("#memberInfo").textContent =
      me.email || "ยินดีต้อนรับสู่พื้นที่ส่วนตัวของคุณ";
    document.querySelector("#chatLauncher").hidden = false;
    await loadBookings();
  } catch (error) {
    if (error.status === 401) signIn();
    else notify(error.message, "error");
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
      notify(error.message, "error");
    } finally {
      busy(button, false);
    }
  });
  return button;
}
async function loadBookings() {
  const request = ++bookingListRequest;
  const bookings = await api("/api/bookings/mine");
  if (request !== bookingListRequest || !me) return;
  bookingsCache = bookings.map((booking) => ({
    ...booking,
    status:
      booking.status === "held" &&
      booking.holdUntil &&
      new Date(booking.holdUntil) < new Date()
        ? "expired"
        : booking.status,
  }));
  document.querySelector("#allBookings").textContent = bookings.length;
  document.querySelector("#activeBookings").textContent = bookings.filter((b) =>
    ["confirmed", "checked_in"].includes(b.status),
  ).length;
  document.querySelector("#reviewBookings").textContent = bookings.filter(
    (b) => b.status === "pending_review",
  ).length;
  await renderBookingList();
}
async function renderBookingList() {
  const query = document
    .querySelector("#bookingSearch")
    .value.trim()
    .toLocaleLowerCase("th-TH");
  const groups = {
    action: ["held", "pending_review", "replacement_pending"],
    upcoming: ["confirmed", "checked_in"],
    closed: ["checked_out", "cancelled", "no_show", "expired"],
  };
  const bookings = bookingsCache.filter(
    (b) =>
      (bookingFilter === "all" || groups[bookingFilter].includes(b.status)) &&
      (!query ||
        (query.startsWith("#")
          ? String(b.id) === query.slice(1)
          : [
              b.id,
              b.checkIn,
              b.checkOut,
              dateLabel(b.checkIn),
              dateLabel(b.checkOut),
              statusLabel(b.status),
            ]
              .join(" ")
              .toLocaleLowerCase("th-TH")
              .includes(query))),
  );
  document.querySelector("#bookingResultCount").textContent =
    `แสดง ${bookings.length} จาก ${bookingsCache.length} รายการ`;
  clear(list);
  if (!bookings.length) {
    ++detailRequest;
    list.append(
      node(
        "p",
        bookingsCache.length ? "ไม่พบรายการที่ตรงกัน" : "ยังไม่มีรายการจอง",
        "status info",
      ),
    );
    clear(detailBox);
    detailBox.append(
      node("h2", bookingsCache.length ? "ค้นหาการจองของคุณ" : "ให้วันพักผ่อนเริ่มต้นขึ้น"),
      node(
        "p",
        bookingsCache.length
          ? "ลองค้นหาด้วยเลขการจองหรือวันที่ หรือเลือกดูรายการทั้งหมด"
          : "เลือกห้องที่ชอบจากหน้าแรก แล้วกลับมาดูรายละเอียดการเข้าพักทั้งหมดได้ที่นี่",
        "subtle",
      ),
    );
    if (bookingsCache.length) {
      const reset = node("button", "ล้างตัวกรอง", "btn btn-outline");
      reset.type = "button";
      reset.addEventListener("click", () => {
        document.querySelector("#bookingSearch").value = "";
        setBookingFilter("all");
      });
      detailBox.append(reset);
    } else {
      const link = node("a", "สำรวจห้องพัก", "btn btn-primary");
      link.href = "/#rooms";
      detailBox.append(link);
    }
    detailBox.setAttribute("aria-busy", "false");
    selectedId = null;
    return;
  }
  if (!bookings.some((b) => b.id === selectedId)) selectedId = bookings[0].id;
  for (const booking of bookings) {
    const button = node(
      "button",
      "",
      `booking-item${selectedId === booking.id ? " active" : ""}`,
    );
    button.type = "button";
    button.setAttribute("aria-pressed", String(selectedId === booking.id));
    button.dataset.bookingId = booking.id;
    button.append(
      node("strong", `รายการ #${booking.id}`),
      node(
        "div",
        `${dateLabel(booking.checkIn)} – ${dateLabel(booking.checkOut)}`,
        "small",
      ),
      node(
        "span",
        statusLabel(booking.status),
        `badge state-${booking.status}`,
      ),
      node("span", baht(booking.total), "booking-total"),
    );
    button.addEventListener("click", async () => {
      selectedId = booking.id;
      for (const item of list.children) {
        const active = Number(item.dataset.bookingId) === selectedId;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      }
      const url = new URL(location.href);
      url.searchParams.set("bookingId", selectedId);
      history.replaceState(null, "", url);
      try {
        await loadDetail();
      } catch (error) {
        notify(error.message, "error");
      }
    });
    list.append(button);
  }
  await loadDetail();
}
function setBookingFilter(value) {
  bookingFilter = value;
  for (const button of document.querySelector("#bookingFilters").children)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === value),
    );
  renderBookingList().catch((error) => notify(error.message, "error"));
}
async function loadDetail() {
  if (!selectedId) return;
  const request = ++detailRequest;
  clear(detailBox);
  detailBox.append(node("p", "กำลังโหลดรายละเอียดการจอง…", "subtle"));
  detailBox.setAttribute("aria-busy", "true");
  let b;
  try {
    b = await api(`/api/bookings/${selectedId}`);
  } catch (error) {
    if (request === detailRequest)
      status(
        detailBox,
        "ไม่สามารถโหลดรายละเอียดได้ กรุณากดรีเฟรชรายการจองเพื่อลองอีกครั้ง",
        "error",
      );
    throw error;
  } finally {
    if (request === detailRequest) detailBox.setAttribute("aria-busy", "false");
  }
  if (request !== detailRequest || !me) return;
  const expired =
    b.status === "held" &&
    b.hold_until &&
    new Date(b.hold_until).getTime() <= Date.now();
  const currentStatus = expired ? "expired" : b.status;
  const pendingPayments = b.payments.filter(
    (p) => p.status === "pending_review",
  );
  if (expired) {
    const cached = bookingsCache.find((item) => item.id === b.id);
    if (cached) cached.status = "expired";
    const selected = Array.from(list.children).find(
      (item) => Number(item.dataset.bookingId) === b.id,
    );
    const badge =
      selected &&
      Array.from(selected.children).find((item) =>
        item.className.startsWith("badge "),
      );
    if (badge) {
      badge.textContent = statusLabel("expired");
      badge.className = "badge state-expired";
    }
  }
  clear(detailBox);
  const heading = node("div", "", "booking-detail-heading");
  const headingCopy = node("div");
  headingCopy.append(
    node("p", `การจอง #${b.id}`, "booking-reference"),
    node("h2", `${dateLabel(b.check_in)} – ${dateLabel(b.check_out)}`),
  );
  const badge = node("span", "", `badge state-${currentStatus}`);
  badge.append(
    icon(
      ["confirmed", "checked_in", "checked_out"].includes(currentStatus)
        ? "check-circle-2"
        : ["cancelled", "expired", "no_show"].includes(currentStatus)
          ? "circle-alert"
          : "clock",
    ),
    node("span", statusLabel(currentStatus)),
  );
  heading.append(headingCopy, badge);
  detailBox.append(heading);
  const guidance = {
    held: `กันห้องไว้ถึง ${timeLabel(b.hold_until)} กรุณาส่งรายการชำระก่อนหมดเวลา ยอดมัดจำที่ต้องอนุมัติ ${baht(b.deposit_due)}`,
    pending_review:
      "ได้รับรายการชำระแล้ว กำลังรอฝ่ายบัญชีตรวจสอบ การจองจะยืนยันเมื่อยอดที่อนุมัติครบมัดจำ",
    confirmed: pendingPayments.length
      ? "ยืนยันการจองแล้ว รายการชำระเพิ่มเติมอยู่ระหว่างตรวจสอบ กรุณารอผลก่อนส่งรายการใหม่"
      : Number(b.balance) > 0
        ? "ยืนยันการจองแล้ว เช็คอินตั้งแต่ 14:00 น. ชำระยอดค้างชำระให้ครบก่อนเข้าพัก"
        : "ยืนยันการจองและชำระครบแล้ว พร้อมเช็คอินตั้งแต่ 14:00 น. ในวันเข้าพัก",
    checked_in: "ยินดีต้อนรับสู่ TKC Hotel ติดต่อฝ่ายต้อนรับผ่านปุ่มแชตมุมหน้าจอได้ตลอดการเข้าพัก",
    checked_out: "ขอบคุณที่เลือกพักกับเรา แบ่งปันประสบการณ์ของคุณผ่านแบบรีวิวด้านล่างได้เลย",
    replacement_pending: "ฝ่ายต้อนรับเสนอห้องทดแทน กรุณาตรวจสอบและเลือกตอบรับด้านล่าง",
    cancelled:
      "รายการจองนี้ยกเลิกแล้ว หากมีคำขอคืนเงิน ฝ่ายบริหารและฝ่ายบัญชีจะดำเนินการตามเงื่อนไข ติดต่อฝ่ายต้อนรับเพื่อติดตามได้",
    no_show: "รายการนี้ถูกปิดเนื่องจากไม่เข้าพัก ติดต่อฝ่ายต้อนรับหากต้องการความช่วยเหลือ",
    expired:
      "หมดเวลาส่งรายการชำระสำหรับการกันห้องนี้แล้ว กรุณาเลือกห้องและสร้างการจองใหม่จากหน้าแรก",
  };
  const actionArea = node("section", "", "booking-action-area");
  actionArea.setAttribute("aria-label", "สถานะและขั้นตอนถัดไป");
  actionArea.append(
    node(
      "p",
      guidance[currentStatus] || "ติดต่อฝ่ายต้อนรับเพื่อตรวจสอบสถานะรายการ",
      "booking-guidance",
    ),
  );
  const nextActions = node("div", "", "booking-next-actions");
  const jump = (id) => {
    const target = document.querySelector(`#${id}`);
    const disclosure = target?.closest("details");
    if (disclosure) disclosure.open = true;
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  };
  const next = (label, symbol, handler, primary = false) => {
    const button = node(
      "button",
      "",
      primary ? "btn next-primary" : "btn btn-outline",
    );
    button.type = "button";
    button.append(icon(symbol), node("span", label));
    button.addEventListener("click", handler);
    nextActions.append(button);
  };
  if (
    !expired &&
    !pendingPayments.length &&
    Number(b.balance) > 0 &&
    ["held", "confirmed", "checked_in"].includes(b.status)
  )
    next("ดำเนินการชำระเงิน", "credit-card", () => jump("bookingPayment"), true);
  if (pendingPayments.length)
    next(
      "ตรวจสอบสถานะล่าสุด",
      "refresh-cw",
      async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await loadBookings();
        } catch (error) {
          notify(error.message, "error");
          button.disabled = false;
        }
      },
      b.status !== "replacement_pending" &&
        !["cancelled", "no_show"].includes(currentStatus),
    );
  if (b.status === "replacement_pending")
    next(
      "เลือกห้องทดแทน",
      "circle-alert",
      () => jump("replacementDecision"),
      true,
    );
  if (["confirmed", "replacement_pending"].includes(b.status))
    next("แจ้งเวลามาถึง", "clock", () => jump("lateArrival"));
  if (["checked_in", "checked_out"].includes(b.status))
    next("เขียนรีวิว", "receipt-text", () => jump("bookingReview"));
  next("ติดต่อฝ่ายต้อนรับ", "message-circle", () => setChatOpen(true));
  if (
    ["expired", "cancelled", "checked_out", "no_show"].includes(currentStatus)
  ) {
    const link = node("a", "", "btn next-primary");
    link.href = "/?book=1#rooms";
    link.append(icon("plus"), node("span", "จองการเข้าพักใหม่"));
    nextActions.prepend(link);
  }
  actionArea.append(nextActions);
  detailBox.append(actionArea);
  const steps = [
    "held",
    "pending_review",
    "confirmed",
    "checked_in",
    "checked_out",
  ];
  const stage = steps.indexOf(b.status);
  if (!expired && stage >= 0) {
    const lifecycle = node("ol", "", "booking-lifecycle");
    lifecycle.setAttribute("aria-label", "ขั้นตอนการจอง");
    for (const [index, value] of steps.entries()) {
      const step = node(
        "li",
        statusLabel(value),
        index <= stage ? "complete" : "",
      );
      if (index === stage) step.setAttribute("aria-current", "step");
      lifecycle.append(step);
    }
    detailBox.append(lifecycle);
  }
  const rooms = node("div", "", "mini-list booking-rooms");
  for (const room of b.rooms)
    rooms.append(
      node(
        "div",
        `${room.typeName} · ${room.guests} ท่าน${room.code ? ` · ห้อง ${room.code}` : ""}`,
      ),
    );
  detailBox.append(node("h3", "ห้องพัก"), rooms);
  const amounts = node("div", "", "booking-amounts");
  for (const [label, value, kind] of [
    ["ยอดจอง", b.total, "total"],
    ["ชำระแล้ว (อนุมัติ)", b.paid, "paid"],
    ["ยอดค้างชำระ", b.balance, "balance"],
  ]) {
    const row = node("div", "", `price-line amount-${kind}`);
    if (
      (kind === "paid" && Number(value) > 0) ||
      (kind === "balance" && Number(value) === 0)
    )
      row.classList.toggle("amount-success", true);
    if (
      kind === "balance" &&
      Number(value) > 0 &&
      !["cancelled", "expired", "no_show"].includes(currentStatus)
    )
      row.classList.toggle("amount-due", true);
    row.append(node("span", label), node("strong", baht(value)));
    amounts.append(row);
  }
  detailBox.append(amounts);
  if (pendingPayments.length)
    detailBox.append(
      node(
        "p",
        `รอตรวจสอบ ${baht(pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0))} · ยังไม่หักจากยอดค้างชำระ`,
        "status info",
      ),
    );
  if (b.payments.length) {
    const history = node("details", "", "payment-history");
    history.append(
      node("summary", `ประวัติการชำระ · ${b.payments.length} รายการ`),
    );
    for (const p of b.payments) {
      const row = node("div", "", "transaction-row");
      const copy = node("div");
      copy.append(
        node(
          "strong",
          `${paymentMethod(p.method)}${p.channelDetail ? ` · ${channelLabel(p.channelDetail)}` : ""} · ${baht(p.amount)}`,
        ),
        node("p", timeLabel(p.submittedAt), "subtle small"),
      );
      if (p.rejectionReason)
        copy.append(node("p", `เหตุผล: ${p.rejectionReason}`, "payment-reason"));
      row.append(
        copy,
        node("span", statusLabel(p.status), `badge state-${p.status}`),
      );
      history.append(row);
    }
    detailBox.append(history);
  }
  if (b.services.length) {
    const services = node("details", "", "service-history");
    services.append(
      node("summary", `บริการที่เลือกไว้ · ${b.services.length} รายการ`),
    );
    for (const service of b.services) {
      const row = node("div", "", "transaction-row");
      row.append(
        node(
          "span",
          `${serviceLabel(service.kind)}${service.service_date ? ` · ${dateLabel(service.service_date)}` : ""} × ${service.quantity}`,
        ),
        node(
          "span",
          service.status === "cancelled" ? "ยกเลิกแล้ว" : baht(service.total),
          service.status === "cancelled" ? "badge state-cancelled" : "",
        ),
      );
      services.append(row);
    }
    detailBox.append(services);
  }
  const actions = node("div", "", "booking-actions");
  if (
    !expired &&
    !pendingPayments.length &&
    b.balance > 0 &&
    ["confirmed", "held", "checked_in"].includes(b.status)
  ) {
    const paymentForm = node("form", "", "stack payment-form");
    paymentForm.id = "bookingPayment";
    paymentForm.tabIndex = -1;
    const amount = makeInput("balanceAmount", "number", String(b.balance));
    amount.min = "1";
    amount.max = String(b.balance);
    amount.step = "1";
    amount.required = true;
    const method = document.createElement("select");
    method.id = "balanceMethod";
    for (const [value, label] of [
      ["online_demo", "บัตรหรือ PayPal"],
      ["transfer_demo", "โอนผ่านธนาคาร"],
    ]) {
      const option = node("option", label);
      option.value = value;
      method.append(option);
    }
    const file = makeInput("balanceEvidence", "file");
    file.accept = "image/jpeg,image/png,image/webp";
    const evidence = formRow("หลักฐานการโอน (JPG, PNG หรือ WebP)", file);
    const onlineChoice = document.createElement("select");
    onlineChoice.id = "balanceOnlineChoice";
    for (const [value, label] of [
      ["credit", "บัตรเครดิต"],
      ["debit", "บัตรเดบิต"],
      ["paypal", "PayPal"],
    ]) {
      const option = node("option", label);
      option.value = value;
      onlineChoice.append(option);
    }
    const onlineRow = formRow("ประเภทการชำระ", onlineChoice);
    const bankChoice = document.createElement("select");
    bankChoice.id = "balanceBankChoice";
    for (const [value, label] of [
      ["", "เลือกธนาคาร"],
      ["bbl", "ธนาคารกรุงเทพ"],
      ["kbank", "ธนาคารกสิกรไทย"],
      ["scb", "ธนาคารไทยพาณิชย์"],
      ["ktb", "ธนาคารกรุงไทย"],
      ["other", "ธนาคารอื่น"],
    ]) {
      const option = node("option", label);
      option.value = value;
      bankChoice.append(option);
    }
    const bankRow = formRow("ธนาคารผู้โอน", bankChoice);
    const channelGuide = node("div", "", "payment-channel-guide");
    const channelIcon = node("span", "✓", "payment-channel-guide-icon");
    channelIcon.setAttribute("aria-hidden", "true");
    const guideText = node("div");
    const guideTitle = node("strong", "บัตรเครดิต");
    const guideCopy = node("p", "ตรวจสอบยอดและช่องทางก่อนส่งรายการ");
    guideText.append(guideTitle, guideCopy);
    channelGuide.append(channelIcon, guideText);
    const updateGuide = () => {
      const transfer = method.value === "transfer_demo";
      guideTitle.textContent = transfer
        ? "โอนผ่านธนาคาร"
        : channelLabel(onlineChoice.value);
      guideCopy.textContent = transfer
        ? "เลือกธนาคารผู้โอนและแนบหลักฐานเพื่อส่งตรวจสอบ"
        : "ตรวจสอบยอดและช่องทางก่อนส่งรายการ";
    };
    onlineChoice.addEventListener("change", updateGuide);
    bankRow.hidden = true;
    evidence.hidden = true;
    method.addEventListener("change", () => {
      evidence.hidden = method.value !== "transfer_demo";
      file.required = !evidence.hidden;
      bankRow.hidden = evidence.hidden;
      bankChoice.required = !evidence.hidden;
      onlineRow.hidden = !evidence.hidden;
      updateGuide();
    });
    const button = node("button", "ส่งรายการชำระ", "btn btn-primary");
    button.type = "submit";
    paymentForm.append(
      formRow("จำนวนบาท", amount),
      formRow("ช่องทาง", method),
      onlineRow,
      bankRow,
      channelGuide,
      evidence,
      node(
        "p",
        "ยอดค้างชำระจะลดลงเมื่อฝ่ายบัญชีอนุมัติ กรุณารอผลก่อนส่งรายการใหม่",
        "subtle small",
      ),
      button,
    );
    paymentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      busy(button, true);
      const dialog = document.querySelector("#payment-confirm");
      const choice =
        method.value === "transfer_demo" ? bankChoice : onlineChoice;
      document.querySelector("#payment-confirm-channel").textContent =
        `${method.value === "transfer_demo" ? "โอนผ่าน" : ""}${choice.selectedOptions[0].textContent}`;
      document.querySelector("#payment-confirm-amount").textContent = baht(
        Number(amount.value),
      );
      dialog.returnValue = "";
      dialog.showModal();
      const confirmed = await new Promise((resolve) =>
        dialog.addEventListener(
          "close",
          () => resolve(dialog.returnValue === "confirm"),
          { once: true },
        ),
      );
      if (!confirmed) {
        busy(button, false);
        button.focus();
        return;
      }
      try {
        let evidencePath = null;
        if (method.value === "transfer_demo") {
          if (!file.files[0]) throw new Error("กรุณาแนบหลักฐานการโอน");
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
            channelDetail:
              method.value === "transfer_demo"
                ? bankChoice.value
                : onlineChoice.value,
            evidencePath,
          },
        });
        notify(
          "ส่งรายการชำระแล้ว รอฝ่ายบัญชีตรวจสอบ ยอดนี้ยังไม่ถือว่าชำระสำเร็จ",
          "success",
        );
        await loadBookings();
      } catch (error) {
        notify(error.message, "error");
      } finally {
        busy(button, false);
      }
    });
    const disclosure = node("details", "", "payment-disclosure");
    const summary = node("summary");
    const chevron = icon("chevron-down");
    chevron.setAttribute("class", "icon disclosure-chevron");
    summary.append(
      icon("credit-card"),
      node("strong", "ช่องทางและยอดชำระ"),
      node("span", "เปิดเมื่อพร้อมส่งรายการ", "small"),
      chevron,
    );
    disclosure.append(summary, paymentForm);
    actions.append(disclosure);
  }
  if (
    !expired &&
    ["held", "pending_review", "confirmed", "replacement_pending"].includes(
      b.status,
    )
  )
    actions.append(
      actionButton(
        "ขอยกเลิกการจอง",
        async () => {
          if (!confirm("ยืนยันขอยกเลิกทั้งรายการจอง?")) return;
          const quote = await api(
            `/api/bookings/${b.id}/refund-quote?reason=guest_cancel`,
          );
          if (!confirm(`ยอดคืนตามเงื่อนไข: ${baht(quote.amount)} ยืนยันต่อหรือไม่?`))
            return;
          await api(`/api/bookings/${b.id}/cancel`, { method: "POST" });
          notify("บันทึกคำขอยกเลิกแล้ว รอฝ่ายบริหารพิจารณายอดคืนตามเงื่อนไข", "success");
        },
        "btn btn-danger cancel-booking",
      ),
    );
  if (["confirmed", "replacement_pending"].includes(b.status)) {
    const lateForm = node("form", "", "stack");
    lateForm.id = "lateArrival";
    lateForm.tabIndex = -1;
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
        notify("บันทึกเวลาที่แจ้งแล้ว", "success");
      } catch (error) {
        notify(error.message, "error");
      } finally {
        busy(button, false);
      }
    });
    const disclosure = node("details", "", "optional-action");
    disclosure.append(node("summary", "แจ้งเวลามาถึงช้า"), lateForm);
    actions.append(disclosure);
  }
  for (const p of b.proposals.filter((x) => x.status === "pending")) {
    const box = node("div", "", "status info");
    box.id = "replacementDecision";
    box.tabIndex = -1;
    box.append(node("strong", `เสนอห้องทดแทน ${p.code} โดยไม่เพิ่มราคา`));
    box.append(
      actionButton(
        "รับห้องนี้",
        async () => {
          await api(`/api/bookings/${b.id}/replacement-decision`, {
            method: "POST",
            body: { proposalId: p.id, accepted: true },
          });
          notify("รับห้องทดแทนแล้ว", "success");
        },
        "btn btn-primary",
      ),
      actionButton(
        "ปฏิเสธและขอคืนเงิน",
        async () => {
          await api(`/api/bookings/${b.id}/replacement-decision`, {
            method: "POST",
            body: { proposalId: p.id, accepted: false },
          });
          notify("บันทึกคำขอคืนเงินเต็มจำนวนแล้ว", "success");
        },
        "btn btn-danger",
      ),
    );
    actions.append(box);
  }
  for (const p of b.payments.filter((x) => x.status === "pending_review")) {
    const submitted = new Date(p.submittedAt).getTime();
    if (Date.now() - submitted >= 30 * 60000)
      actions.append(
        actionButton("ติดตามการชำระ", async () => {
          await api(`/api/payments/${p.id}/escalations`, { method: "POST" });
          notify("ส่งเรื่องให้ Superadmin ติดตามแล้ว", "success");
        }),
      );
  }
  if (["checked_in", "checked_out"].includes(b.status)) {
    const reviewForm = node("form", "", "stack");
    reviewForm.id = "bookingReview";
    reviewForm.tabIndex = -1;
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
        notify("ส่งรีวิวแล้ว", "success");
      } catch (error) {
        notify(error.message, "error");
      } finally {
        busy(button, false);
      }
    });
    const disclosure = node("details", "", "optional-action");
    disclosure.append(node("summary", "แบ่งปันประสบการณ์เข้าพัก"), reviewForm);
    actions.append(disclosure);
  }
  detailBox.append(actions);
  await renderTrips({ ...b, status: currentStatus });
}
async function renderTrips(booking) {
  const canBook = ["held", "pending_review", "confirmed"].includes(
    booking.status,
  );
  if (!canBook && booking.status !== "checked_in" && !booking.tours.length)
    return;
  const panel = node("section", "", "panel trip-panel");
  panel.id = "trips";
  const overview = node("div", "", "trip-overview");
  const photo = document.createElement("img");
  photo.src = "/assets/night-market.jpg";
  photo.alt = "บรรยากาศตลาดกลางคืน";
  photo.width = 112;
  photo.height = 84;
  photo.loading = "lazy";
  const copy = node("div");
  copy.append(
    node("h3", "ทริปตลาดกลางคืน"),
    node(
      "p",
      canBook
        ? "เลือกวันและรอบระหว่างเข้าพัก ค่าทริปเพิ่มในยอดจอง"
        : "ดูที่นั่งที่เลือกไว้ หรือติดต่อฝ่ายต้อนรับเมื่อต้องการความช่วยเหลือ",
      "subtle small",
    ),
  );
  const seats = booking.tours.filter(
    (participant) => participant.status !== "cancelled",
  ).length;
  copy.append(
    node(
      "span",
      seats ? `เลือกไว้ ${seats} ที่นั่ง` : "ยังไม่ได้เลือกที่นั่ง",
      "trip-seat-count",
    ),
  );
  overview.append(photo, copy);
  panel.append(overview);
  detailBox.append(panel);
  const past = node("div", "", "mini-list");
  for (const participant of booking.tours) {
    const row = node("div", "", "tour-participant");
    row.append(
      node(
        "span",
        `${participant.participant_label} · ${dateLabel(participant.tourDate)} ${String(participant.timeLabel).slice(0, 5)} · ${baht(participant.price)}`,
      ),
      node(
        "span",
        participant.status === "cancelled"
          ? "ยกเลิกแล้ว"
          : participant.status === "confirmed"
            ? "ยืนยันแล้ว"
            : "รอยืนยัน",
        `badge state-${participant.status === "held" ? "pending_review" : participant.status}`,
      ),
    );
    if (participant.status !== "cancelled") {
      const cancel = node("button", "ยกเลิกที่นั่ง", "btn btn-danger");
      cancel.type = "button";
      cancel.style.marginLeft = ".7rem";
      cancel.addEventListener("click", async () => {
        busy(cancel, true);
        try {
          await api(`/api/tours/participants/${participant.id}/cancel`, {
            method: "POST",
          });
          notify("ยกเลิกที่นั่งแล้ว ค่าทริปที่ชำระไม่คืนตามเงื่อนไข", "success");
          await loadBookings();
        } catch (error) {
          notify(error.message, "error");
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
        "หากต้องการเพิ่มทริประหว่างเข้าพัก กรุณาติดต่อฝ่ายต้อนรับเพื่อชำระค่าทริปและยืนยันที่นั่งทันที",
        "subtle",
      ),
    );
  else if (canBook) {
    const dialog = node("dialog", "", "tour-booking-dialog");
    dialog.setAttribute("aria-labelledby", "tourBookingHeading");
    const close = node("button", "ปิด", "btn btn-outline tour-close");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    const image = document.createElement("img");
    image.src = "/assets/night-market.jpg";
    image.alt = "ภาพบรรยากาศตลาดกลางคืน";
    image.width = 640;
    image.height = 360;
    const heading = node("h2", "จองทริปตลาดกลางคืน");
    heading.id = "tourBookingHeading";
    const feedback = node("div");
    feedback.setAttribute("role", "status");
    const open = node("button", "เลือกรอบทริป", "btn btn-dark trip-book-button");
    open.type = "button";
    open.addEventListener("click", () => dialog.showModal());
    const form = node("form", "", "stack");
    const date = makeInput(
      "tourDate",
      "date",
      String(booking.check_in).slice(0, 10),
    );
    date.min = String(booking.check_in).slice(0, 10);
    date.max = shiftDate(String(booking.check_out).slice(0, 10), -1);
    const slot = document.createElement("select");
    slot.id = "tourSlot";
    slot.required = true;
    const participants = makeInput("tourParticipants");
    participants.required = true;
    participants.placeholder = "เช่น คุณอร, คุณนัท";
    const info = node("p", "", "subtle small");
    let slotRequest = 0;
    const loadSlots = async () => {
      const request = ++slotRequest;
      slot.replaceChildren();
      slot.disabled = true;
      submit.disabled = true;
      if (
        date.value < String(booking.check_in).slice(0, 10) ||
        date.value >= String(booking.check_out).slice(0, 10)
      ) {
        info.textContent = "เลือกวันภายในช่วงเข้าพัก";
        return;
      }
      try {
        const slots = await api(`/api/tours/slots?date=${date.value}`);
        if (request !== slotRequest) return;
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
        slot.disabled = false;
        submit.disabled = !slots.some((x) => x.available > 0);
      } catch (error) {
        if (request === slotRequest) info.textContent = error.message;
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
        notify(
          `จองรอบทริปแล้ว เพิ่มค่าทริป ${baht(result.charge)} ในรายการจอง`,
          "success",
        );
        dialog.close();
        await loadBookings();
      } catch (error) {
        status(feedback, error.message, "error");
      } finally {
        busy(submit, false);
      }
    });
    dialog.append(close, image, heading, feedback, form);
    panel.append(open, dialog);
    await loadSlots();
    if (location.hash === "#trips" && panel.isConnected) {
      dialog.showModal();
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }
  if (location.hash === "#trips" && panel.isConnected)
    panel.scrollIntoView({ block: "start" });
}
async function loadChat() {
  if (!me || !chatOpen) return;
  const session = chatSession;
  const accountId = me.id;
  try {
    const messages = await api(`/api/chats/${accountId}/messages`);
    if (!chatOpen || session !== chatSession || me?.id !== accountId) return;
    status(document.querySelector("#chatStatus"), "");
    const target = document.querySelector("#chatLog");
    const snapshot = JSON.stringify(messages);
    if (snapshot === chatSnapshot) return;
    chatSnapshot = snapshot;
    const nearBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 80;
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
    if (messages.length && Number(messages.at(-1).senderId) === Number(me.id))
      target.append(node("p", "ส่งถึงระบบแล้ว รอฝ่ายต้อนรับตอบ", "chat-receipt"));
    if (nearBottom) target.scrollTop = target.scrollHeight;
  } catch (error) {
    if (chatOpen && session === chatSession)
      status(document.querySelector("#chatStatus"), error.message, "error");
  }
}
async function setChatOpen(open, restoreFocus = false) {
  if (open && !me) return;
  if (chatOpen === open) return;
  chatOpen = open;
  ++chatSession;
  const session = chatSession;
  clearInterval(chatTimer);
  chatTimer = null;
  const launcher = document.querySelector("#chatLauncher");
  document.querySelector("#accountChat").hidden = !open;
  launcher.setAttribute("aria-expanded", String(open));
  if (open) {
    document.querySelector("#chatMessage").focus();
    await loadChat();
    if (chatOpen && session === chatSession)
      chatTimer = setInterval(loadChat, 15000);
  } else if (restoreFocus) launcher.focus();
}
document
  .querySelector("#chatLauncher")
  .addEventListener("click", () => setChatOpen(!chatOpen));
document
  .querySelector("#chatClose")
  .addEventListener("click", () => setChatOpen(false, true));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    chatOpen &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    setChatOpen(false, true);
  }
});
document.querySelector("#bookingSearch").addEventListener("input", () => {
  renderBookingList().catch((error) => notify(error.message, "error"));
});
for (const button of document.querySelector("#bookingFilters").children)
  button.addEventListener("click", () =>
    setBookingFilter(button.dataset.filter),
  );
document
  .querySelector("#logoutButton")
  .addEventListener("click", async (event) => {
    const button = event.currentTarget;
    busy(button, true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      setChatOpen(false);
      location.assign("/");
    } catch (error) {
      notify(error.message, "error");
      busy(button, false);
    }
  });
document
  .querySelector("#refreshBookings")
  .addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadBookings();
      notify("อัปเดตสถานะการจองแล้ว", "success");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
document
  .querySelector("#chatForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#chatMessage");
    const button = event.submitter;
    if (!me || !chatOpen) return;
    const session = chatSession;
    const accountId = me.id;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await api(`/api/chats/${accountId}/messages`, {
        method: "POST",
        body: { content: input.value },
      });
      if (!chatOpen || session !== chatSession || me?.id !== accountId) return;
      input.value = "";
      await loadChat();
      notify("ส่งข้อความแล้ว กำลังรอเจ้าหน้าที่ตอบ", "success");
    } catch (error) {
      if (chatOpen && session === chatSession)
        status(document.querySelector("#chatStatus"), error.message, "error");
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      if (chatOpen && session === chatSession && me?.id === accountId)
        input.focus();
    }
  });
document.addEventListener("tkc:authlost", () => {
  clearTimeout(noticeTimer);
  setChatOpen(false);
  me = null;
  ++detailRequest;
  ++bookingListRequest;
  bookingsCache = [];
  chatSnapshot = "";
  document.querySelector("#chatLauncher").hidden = true;
  clear(document.querySelector("#chatLog"));
  status(document.querySelector("#chatStatus"), "");
  clear(detailBox);
  clear(list);
  memberSection.hidden = true;
  authSection.hidden = false;
  signIn();
});
loadMe();
