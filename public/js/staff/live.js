import { api, baht } from "./common.js";

const endpoints = {
  reception: ["/api/reports/overview", "/api/bookings", "/api/chats"],
  housekeeping: ["/api/housekeeping/tasks", "/api/rooms?limit=50"],
  accounting: [
    "/api/reports/financial",
    "/api/payments/pending",
    "/api/refunds",
  ],
  management: [
    "/api/reports/overview",
    "/api/reports/financial",
    "/api/refunds",
    "/api/damage-reports",
    "/api/staff",
  ],
  superadmin: [
    "/api/reports/overview",
    "/api/payments/escalations",
    "/api/bookings",
    "/api/rooms/types",
  ],
};
const count = (rows, predicate) => rows.filter(predicate).length;
const hasStatus =
  (...statuses) =>
  (row) =>
    statuses.includes(row.status);

// These values mirror each department's visible summary, not its editable tables.
export function projectStaffLive(role, data) {
  if (role === "reception") {
    const [overview, bookings, chats] = data;
    const chatCount = count(chats, (x) => x.messageCount);
    return {
      metrics: [
        overview.rooms.occupied,
        overview.rooms.ready,
        overview.rooms.dirty,
        chatCount,
      ],
      priorities: [
        count(bookings, hasStatus("confirmed")),
        count(bookings, hasStatus("checked_in")),
        chatCount,
      ],
    };
  }
  if (role === "housekeeping") {
    const [tasks, rooms] = data;
    const pending = count(tasks, hasStatus("pending"));
    const working = count(tasks, hasStatus("working"));
    return {
      metrics: [
        pending,
        working,
        count(tasks, hasStatus("done")),
        rooms.length,
      ],
      priorities: [pending, working],
    };
  }
  if (role === "accounting") {
    const [report, payments, refunds] = data;
    return {
      metrics: [
        baht(report.received),
        baht(report.refunded),
        baht(report.net),
        report.pendingReviews,
      ],
      priorities: [
        payments.length,
        count(refunds, hasStatus("approved")),
        count(refunds, hasStatus("requested")),
      ],
    };
  }
  if (role === "management") {
    const [overview, finance, refunds, damage, staff] = data;
    return {
      metrics: [
        overview.rooms.ready,
        overview.rooms.occupied,
        overview.rooms.repair,
        baht(finance.net),
      ],
      priorities: [
        count(refunds, hasStatus("requested")),
        damage.length,
        staff.length,
      ],
    };
  }
  if (role === "superadmin") {
    const [overview, escalations, bookings, types] = data;
    return {
      metrics: [
        overview.rooms.total,
        overview.rooms.ready,
        overview.rooms.dirty,
        escalations.length,
      ],
      priorities: [
        count(bookings, hasStatus("confirmed", "replacement_pending")),
        escalations.length,
        types.length,
      ],
    };
  }
  throw new Error("Unknown staff role");
}

export function hasUnsavedInput(root) {
  return [...root.querySelectorAll("input, textarea, select")].some((field) => {
    if (field.disabled || field.type === "hidden") return false;
    if (field.type === "file") return Boolean(field.files?.length);
    if (["checkbox", "radio"].includes(field.type))
      return field.checked !== field.defaultChecked;
    if (field.tagName === "SELECT") {
      const selected =
        [...field.options].find((option) => option.defaultSelected) ||
        field.options[0];
      return field.value !== (selected?.value || "");
    }
    return field.value !== field.defaultValue;
  });
}

export function startStaffLive(role, dashboard) {
  let stopped = false;
  let inFlight = false;
  let previous = null;
  let stale = false;
  const live = document.createElement("span");
  live.className = "staff-live-status";
  live.textContent = "กำลังตรวจข้อมูลภาพรวม";
  document.querySelector("#staffUpdated").after(live);
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  });
  function baselineReset() {
    previous = null;
    stale = false;
  }
  document.addEventListener("tkc:staff-render", baselineReset);
  async function poll() {
    if (
      stopped ||
      inFlight ||
      document.hidden ||
      dashboard.getAttribute("aria-busy") === "true"
    )
      return;
    const current = dashboard.querySelector(".staff-role-overview");
    if (!current) return;
    inFlight = true;
    try {
      const data = await Promise.all(endpoints[role].map((url) => api(url)));
      if (
        stopped ||
        document.hidden ||
        dashboard.querySelector(".staff-role-overview") !== current
      )
        return;
      const fingerprint = JSON.stringify(data);
      if (previous !== null && fingerprint !== previous) stale = true;
      previous = fingerprint;
      const { metrics, priorities } = projectStaffLive(role, data);
      const values = dashboard.querySelectorAll(".staff-cards .metric .value");
      const links = current.querySelectorAll(".staff-priority-heading strong");
      metrics.forEach((value, index) => {
        if (values[index]) values[index].textContent = String(value);
      });
      priorities.forEach((value, index) => {
        if (links[index]) links[index].textContent = String(value);
      });
      live.textContent = stale
        ? `ภาพรวม ${time.format(new Date())} · ตารางอาจเปลี่ยน กดโหลดข้อมูลอีกครั้ง`
        : `ภาพรวมอัปเดต ${time.format(new Date())}`;
      live.dataset.stale = String(stale);
    } catch {
      if (!stopped) live.textContent = "อัปเดตภาพรวมไม่ได้ · ข้อมูลเดิมยังแสดงอยู่";
    } finally {
      inFlight = false;
    }
  }
  const timer = setInterval(poll, 15000);
  document.addEventListener("visibilitychange", poll);
  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      document.removeEventListener("tkc:staff-render", baselineReset);
    },
    { once: true },
  );
  poll();
}
