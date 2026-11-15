import { api } from "../api.js";
import {
  node,
  status as renderStatus,
  busy,
  baht,
  dateLabel,
  bookingStatusLabel,
} from "../ui.js";
export { api, node, busy, baht, dateLabel };
export const dashboard = document.querySelector("#dashboard");
export const feedback = document.querySelector("#staffStatus");
let feedbackTimer;
export function status(target, message, kind = "info") {
  if (target === feedback) clearTimeout(feedbackTimer);
  renderStatus(target, message, kind);
  if (target === feedback && message && kind === "success")
    feedbackTimer = setTimeout(() => renderStatus(target, ""), 5000);
}
export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `/assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}
let formIndex = 0;
let sectionIndex = 0;
const loadedTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});
function freshness(time = new Date()) {
  const label = node(
    "time",
    `โหลดเมื่อ ${loadedTime.format(time)}`,
    "staff-updated",
  );
  label.dateTime = time.toISOString();
  label.title = "โหลดอัตโนมัติเมื่อไม่มีการใช้งาน หรือกดโหลดข้อมูลอีกครั้ง";
  return label;
}
export function clear() {
  document.dispatchEvent(new Event("tkc:staff-render"));
  dashboard.replaceChildren();
  dashboard.setAttribute("aria-busy", "true");
  document.querySelector("#staffSections")?.replaceChildren();
  sectionIndex = 0;
  const updated = document.querySelector("#staffUpdated");
  if (updated) updated.textContent = "ยังไม่มีข้อมูลที่โหลดสำเร็จ";
}
export function roleOverview(title, description, items) {
  const box = node("section", "", "staff-role-overview");
  const heading = node("h2", title);
  heading.id = "staff-overview-title";
  box.setAttribute("aria-labelledby", heading.id);
  const intro = node("div", "", "staff-overview-intro");
  intro.append(heading, node("p", description));
  const links = node("nav", "", "staff-priorities");
  links.setAttribute("aria-label", "เปิดงานตามภาพรวมฝ่าย");
  for (const { label, value, target, detail } of items) {
    const link = node("a", "", "staff-priority");
    link.href = `#${target.id}`;
    const line = node("span", "", "staff-priority-heading");
    line.append(node("span", label), node("strong", String(value)));
    link.append(
      line,
      node("span", detail, "staff-priority-detail"),
      icon("arrow-right"),
    );
    links.append(link);
  }
  box.append(intro, links);
  dashboard.prepend(box);
}
export function section(title, caption = "") {
  const box = node("section", "", "staff-section");
  box.id = `staff-section-${++sectionIndex}`;
  const heading = node("div", "", "staff-toolbar");
  const left = node("div");
  const titleNode = node("h2", title);
  titleNode.id = `${box.id}-title`;
  box.setAttribute("aria-labelledby", titleNode.id);
  left.append(titleNode);
  if (caption) left.append(node("p", caption, "subtle small"));
  heading.append(left);
  box.append(heading);
  dashboard.append(box);
  const link = node("a", title);
  link.href = `#${box.id}`;
  document.querySelector("#staffSections")?.append(link);
  return box;
}
export function panel(parent, title) {
  const box = node("div", "", "panel");
  if (title) box.append(node("h3", title));
  parent.append(box);
  return box;
}
export function metricGrid(items) {
  dashboard.setAttribute("aria-busy", "false");
  document.querySelector("#staffUpdated")?.replaceChildren(freshness());
  const grid = node("div", "", "staff-cards");
  grid.setAttribute("aria-label", "ภาพรวมงาน");
  for (const [label, value] of items) {
    const card = node("div", "", "metric");
    card.append(
      node("div", String(value), "value"),
      node("div", label, "label"),
    );
    grid.append(card);
  }
  dashboard.append(grid);
}
export function table(parent, columns, rows, actions = []) {
  const group = node("div", "", "staff-table");
  const toolbar = node("div", "", "staff-table-toolbar");
  const count = node("span", `${rows.length} รายการ`, "staff-table-count");
  count.setAttribute("aria-live", "polite");
  count.setAttribute("aria-atomic", "true");
  const wrap = node("div", "", "table-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  const title =
    parent.closest(".staff-section")?.querySelector("h2")?.textContent ||
    "รายการข้อมูล";
  wrap.setAttribute("aria-label", `${title} — ตารางข้อมูล เลื่อนเพื่อดูเพิ่มเติม`);
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "ค้นหาในตาราง";
  search.setAttribute("aria-label", `ค้นหาในตาราง ${title}`);
  search.disabled = rows.length === 0;
  const searchBox = node("div", "", "staff-table-search");
  searchBox.append(icon("search"), search);
  const meta = node("div", "", "staff-table-meta");
  meta.append(count, freshness());
  toolbar.append(meta, searchBox);
  const t = document.createElement("table");
  const head = document.createElement("thead");
  const hrow = document.createElement("tr");
  for (const [, label] of columns) {
    const th = node("th", label);
    th.scope = "col";
    hrow.append(th);
  }
  if (actions.length) {
    const th = node("th", "ดำเนินการ");
    th.scope = "col";
    hrow.append(th);
  }
  head.append(hrow);
  t.append(head);
  const body = document.createElement("tbody");
  const searchable = [];
  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = node("td", "", "table-empty");
    cell.append(
      node("strong", "ไม่มีรายการในขณะนี้"),
      node("p", "รายการใหม่จะแสดงที่นี่เมื่อมีข้อมูล"),
    );
    cell.colSpan = columns.length + (actions.length ? 1 : 0);
    row.append(cell);
    body.append(row);
  }
  for (const item of rows) {
    const row = document.createElement("tr");
    for (const [key] of columns) {
      const value = typeof key === "function" ? key(item) : item[key];
      const cell = node("td");
      if (key === "status" && value) {
        const label =
          {
            pending: "รอดำเนินการ",
            working: "กำลังทำความสะอาด",
            done: "เสร็จแล้ว",
            ready: "พร้อมเข้าพัก",
            dirty: "รอทำความสะอาด",
            occupied: "มีผู้เข้าพัก",
            repair: "ปิดซ่อม",
            requested: "รออนุมัติ",
            recorded: "บันทึกแล้ว",
            refunded: "คืนเงินแล้ว",
          }[value] || bookingStatusLabel(value);
        const badge = node("span", String(label), "staff-state");
        badge.dataset.state = String(value);
        cell.append(badge);
      } else {
        const labels = {
          credit: "บัตรเครดิต",
          debit: "บัตรเดบิต",
          paypal: "PayPal",
          bbl: "กรุงเทพ",
          kbank: "กสิกรไทย",
          scb: "ไทยพาณิชย์",
          ktb: "กรุงไทย",
          other: "ธนาคารอื่น",
          online_demo: "ออนไลน์",
          transfer_demo: "โอนเงิน",
          reception_demo: "เคาน์เตอร์ต้อนรับ",
        };
        cell.textContent =
          ["method", "channelDetail"].includes(key) &&
          Object.hasOwn(labels, value)
            ? labels[value]
            : String(value ?? "—");
      }
      if (typeof value === "number" || /^[฿\d]/.test(String(value)))
        cell.classList.add("table-number");
      if (["customerName", "fullName"].includes(key))
        cell.classList.add("table-person");
      row.append(cell);
    }
    searchable.push({ row, text: row.textContent.toLocaleLowerCase("th") });
    if (actions.length) {
      const cell = document.createElement("td");
      cell.className = "table-actions";
      const group = node("div", "", "staff-button-group");
      for (const action of actions) {
        if (action.when && !action.when(item)) continue;
        const button = node(
          "button",
          action.label,
          `btn ${action.intent === "primary" ? "btn-primary" : action.intent === "danger" ? "btn-danger" : "btn-outline"}`,
        );
        button.type = "button";
        if (action.help) button.title = action.help;
        button.setAttribute(
          "aria-label",
          `${action.label} · ${item.customerName || item.name || item.code || `รายการ ${item.id ?? ""}`}`,
        );
        button.addEventListener("click", async () => {
          if (action.confirm && !confirm(action.confirm(item))) return;
          cell.querySelector(".staff-inline-error")?.remove();
          busy(button, true);
          try {
            const result = await action.run(item);
            if (result === false) return;
            if (!action.readOnly)
              status(feedback, action.success || "บันทึกแล้ว", "success");
            await action.refresh?.();
          } catch (error) {
            dashboard.setAttribute("aria-busy", "false");
            status(feedback, error.message, "error");
            const message = node("p", error.message, "staff-inline-error");
            message.setAttribute("role", "alert");
            cell.append(message);
          } finally {
            busy(button, false);
          }
        });
        group.append(button);
      }
      cell.append(group);
      row.append(cell);
    }
    body.append(row);
  }
  t.append(body);
  if (rows.length) {
    const noMatch = document.createElement("tr");
    const cell = node(
      "td",
      "ไม่พบรายการที่ตรงกับคำค้น ลองใช้คำอื่นหรือล้างช่องค้นหา",
      "table-empty",
    );
    cell.colSpan = columns.length + (actions.length ? 1 : 0);
    noMatch.append(cell);
    noMatch.hidden = true;
    body.append(noMatch);
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase("th");
      let visible = 0;
      for (const item of searchable) {
        item.row.hidden = !item.text.includes(query);
        if (!item.row.hidden) visible++;
      }
      noMatch.hidden = visible > 0;
      count.textContent = query
        ? `${visible} จาก ${rows.length} รายการ`
        : `${rows.length} รายการ`;
    });
  }
  wrap.append(t);
  group.append(toolbar, wrap);
  parent.append(group);
  const guides = actions.filter((action) => action.help);
  if (guides.length) {
    const guide = node("p", "", "staff-action-guide");
    for (const [index, action] of guides.entries()) {
      if (index) guide.append(" · ");
      guide.append(node("strong", `${action.label}: `), action.help);
    }
    parent.append(guide);
  }
  return wrap;
}
export function form(
  parent,
  title,
  fields,
  onSubmit,
  buttonText = "บันทึก",
  options = {},
) {
  const box = node("details", "", "staff-form-disclosure");
  let tasks = parent.querySelector(":scope > .staff-task-forms");
  if (!tasks) {
    tasks = node("div", "", "staff-task-forms");
    parent.append(tasks);
  }
  const summary = node("summary");
  summary.append(icon("plus"), node("span", title));
  box.append(summary);
  tasks.append(box);
  const f = node("form", "", "inline-form panel");
  f.setAttribute("aria-label", title);
  if (options.help) f.append(node("p", options.help, "staff-form-help"));
  const inputs = {};
  formIndex++;
  for (const spec of fields) {
    const wrap = document.createElement("div");
    const label = node("label", spec.label);
    label.htmlFor = `staff-${formIndex}-${spec.name}`;
    let input;
    if (spec.options) {
      input = document.createElement("select");
      for (const [value, text] of spec.options) {
        const option = node("option", text);
        option.value = value;
        input.append(option);
      }
    } else if (spec.type === "textarea")
      input = document.createElement("textarea");
    else {
      input = document.createElement("input");
      input.type = spec.type || "text";
    }
    input.id = `staff-${formIndex}-${spec.name}`;
    input.name = spec.name;
    input.required = spec.required ?? true;
    if (spec.value !== undefined) {
      input.value = spec.value;
      if (input.tagName === "SELECT") {
        for (const option of input.options)
          option.defaultSelected = option.value === String(spec.value);
      } else input.defaultValue = String(spec.value);
    }
    if (spec.min !== undefined) input.min = spec.min;
    if (spec.max !== undefined) input.max = spec.max;
    if (spec.placeholder) input.placeholder = spec.placeholder;
    inputs[spec.name] = input;
    wrap.append(label, input);
    const help =
      spec.hint ||
      {
        bookingId: "เลข # จากตารางการจอง",
        bookingRoomId: "รหัสรายการห้องจากรายละเอียดการจอง",
        roomId: "เลข # ของห้องจริง ไม่ใช่รหัสห้อง เช่น Std301",
        typeId: "เลข # ของประเภทห้อง",
      }[spec.name];
    if (help) {
      const hint = node("small", help, "field-hint");
      hint.id = `${input.id}-hint`;
      input.setAttribute("aria-describedby", hint.id);
      wrap.append(hint);
    }
    f.append(wrap);
  }
  const button = node(
    "button",
    buttonText,
    `btn ${options.intent === "danger" ? "btn-danger" : "btn-primary"}`,
  );
  button.type = "submit";
  const footer = node("div", "", "staff-form-footer");
  footer.append(button, node("small", "ตรวจสอบข้อมูลก่อนบันทึก", "subtle"));
  f.append(footer);
  const localStatus = node("div", "", "staff-inline-status");
  localStatus.setAttribute("role", "status");
  localStatus.setAttribute("aria-live", "polite");
  f.append(localStatus);
  f.addEventListener("submit", async (event) => {
    event.preventDefault();
    status(localStatus, "");
    busy(button, true);
    try {
      const values = {};
      for (const [name, input] of Object.entries(inputs))
        values[name] =
          input.type === "number" ? Number(input.value) : input.value;
      await onSubmit(values, inputs);
      if (!options.readOnly) status(feedback, "บันทึกแล้ว", "success");
      f.reset();
    } catch (error) {
      dashboard.setAttribute("aria-busy", "false");
      status(feedback, error.message, "error");
      status(localStatus, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
  box.append(f);
  return { box, inputs };
}
export function note(parent, text) {
  parent.append(node("p", text, "staff-note"));
}
export async function reloadAfter(action, refresh) {
  await action();
  await refresh();
}
