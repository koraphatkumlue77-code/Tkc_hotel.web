// Keep the original form controls as the source of truth for submission and validation.
const pad = (n) => String(n).padStart(2, "0");
const iso = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = (value) => {
  const parts = value?.split("-").map(Number);
  return parts?.length === 3
    ? new Date(parts[0], parts[1] - 1, parts[2], 12)
    : new Date();
};
const monthFormat = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  month: "long",
  year: "numeric",
});
const dateFormat = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const calendar = document.createElement("dialog");
calendar.className = "themed-calendar";
calendar.setAttribute("aria-labelledby", "themed-calendar-title");
calendar.innerHTML =
  '<div class="calendar-head"><div><span>วันที่เข้าพัก</span><h2 id="themed-calendar-title">เลือกวันที่</h2></div><button type="button" class="calendar-close" aria-label="ปิดปฏิทิน">×</button></div><div class="calendar-month"><button type="button" data-month="-1" aria-label="เดือนก่อน">‹</button><strong aria-live="polite"></strong><button type="button" data-month="1" aria-label="เดือนถัดไป">›</button></div><div class="calendar-week" aria-hidden="true"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div><div class="calendar-days" role="group" aria-label="วันที่ในเดือน"></div><p class="calendar-note">เลือกวันที่ต้องการเพื่อดำเนินการต่อ</p>';
document.body.append(calendar);
let currentInput;
let cursor;
function renderCalendar(focus = false) {
  const year = cursor.getFullYear(),
    month = cursor.getMonth();
  calendar.querySelector(".calendar-month strong").textContent =
    monthFormat.format(cursor);
  const grid = calendar.querySelector(".calendar-days");
  grid.replaceChildren();
  const first = new Date(year, month, 1, 12).getDay();
  for (let i = 0; i < first; i++) grid.append(document.createElement("span"));
  const count = new Date(year, month + 1, 0, 12).getDate();
  for (let day = 1; day <= count; day++) {
    const date = new Date(year, month, day, 12),
      value = iso(date);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(day);
    button.dataset.date = value;
    button.setAttribute("aria-label", dateFormat.format(date));
    button.setAttribute("aria-pressed", String(value === currentInput.value));
    button.disabled = Boolean(
      (currentInput.min && value < currentInput.min) ||
      (currentInput.max && value > currentInput.max),
    );
    button.addEventListener("click", () => {
      currentInput.value = value;
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      currentInput.dispatchEvent(new Event("change", { bubbles: true }));
      calendar.close();
    });
    grid.append(button);
  }
  if (focus)
    (
      grid.querySelector(`[data-date="${iso(cursor)}"]:not(:disabled)`) ||
      grid.querySelector("button:not(:disabled)") ||
      calendar.querySelector(".calendar-close")
    ).focus();
}
calendar
  .querySelector(".calendar-close")
  .addEventListener("click", () => calendar.close());
calendar.querySelectorAll("[data-month]").forEach((button) =>
  button.addEventListener("click", () => {
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + Number(button.dataset.month),
      1,
      12,
    );
    renderCalendar();
  }),
);
calendar
  .querySelector(".calendar-days")
  .addEventListener("keydown", (event) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (!delta || !event.target.dataset.date) return;
    event.preventDefault();
    cursor = parse(event.target.dataset.date);
    cursor.setDate(cursor.getDate() + delta);
    renderCalendar(true);
  });
calendar.addEventListener("close", () => currentInput?.focus());
for (const input of document.querySelectorAll(
  "#checkin, #checkout, #modal-checkin, #modal-checkout",
)) {
  input.setAttribute("aria-haspopup", "dialog");
  const open = () => {
    currentInput = input;
    cursor = parse(input.value || input.min);
    renderCalendar();
    calendar.showModal();
    renderCalendar(true);
  };
  input.addEventListener("click", (event) => {
    event.preventDefault();
    open();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || (event.altKey && event.key === "ArrowDown")) {
      event.preventDefault();
      open();
    }
  });
}

for (const select of document.querySelectorAll(
  "#room-type, #guests, #attraction-season",
)) {
  const wrapper = document.createElement("span");
  wrapper.className = "themed-select";
  select.before(wrapper);
  wrapper.append(select);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "themed-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") ||
      (select.id === "room-type" ? "เลือกห้อง" : "เลือกฤดู"),
  );
  const list = document.createElement("span");
  list.className = "themed-select-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  const close = (focus = false) => {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus();
  };
  const sync = () => {
    trigger.textContent = select.selectedOptions[0]?.textContent || "เลือก";
  };
  function positionList() {
    if (list.hidden) return;
    list.classList.remove("opens-up");
    list.style.maxHeight = "260px";
    const triggerBounds = trigger.getBoundingClientRect();
    const header = document
      .querySelector(".site-header")
      ?.getBoundingClientRect();
    const topEdge =
      header && header.top <= 0 && header.bottom > 0 ? header.bottom + 8 : 12;
    const above = Math.max(0, triggerBounds.top - topEdge - 6);
    const below = Math.max(0, innerHeight - triggerBounds.bottom - 18);
    const wanted = list.getBoundingClientRect().height;
    const opensUp = wanted > below && above > below;
    list.classList.toggle("opens-up", opensUp);
    list.style.maxHeight = `${Math.max(0, Math.min(260, opensUp ? above : below))}px`;
  }
  function open() {
    list.replaceChildren();
    for (const option of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "option");
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      item.setAttribute("aria-selected", String(option.selected));
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close(true);
      });
      list.append(item);
    }
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    positionList();
    (
      list.querySelector('[aria-selected="true"]:not(:disabled)') ||
      list.querySelector("button:not(:disabled)")
    )?.focus();
  }
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    list.hidden ? open() : close();
  });
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      close(true);
      return;
    }
    if (list.hidden && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      open();
      return;
    }
    if (
      !list.hidden &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const items = [...list.querySelectorAll("button:not(:disabled)")];
      const index = items.indexOf(document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!wrapper.contains(event.target)) close();
  });
  window.addEventListener("scroll", positionList, { passive: true });
  window.addEventListener("resize", positionList);
  wrapper.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) close();
    }, 0);
  });
  select.addEventListener("change", sync);
  select.hidden = true;
  wrapper.append(trigger, list);
  sync();
}
