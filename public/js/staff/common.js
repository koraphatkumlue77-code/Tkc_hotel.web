import { api } from "../api.js";
import {
  node,
  status,
  busy,
  baht,
  dateLabel,
  bookingStatusLabel,
} from "../ui.js";
export { api, node, status, busy, baht, dateLabel };
export const dashboard = document.querySelector("#dashboard");
export const feedback = document.querySelector("#staffStatus");
let formIndex = 0;
export function clear() {
  dashboard.replaceChildren();
}
export function section(title, caption = "") {
  const box = node("section", "", "staff-section");
  const heading = node("div", "", "staff-toolbar");
  const left = node("div");
  left.append(node("h2", title));
  if (caption) left.append(node("p", caption, "subtle small"));
  heading.append(left);
  box.append(heading);
  dashboard.append(box);
  return box;
}
export function panel(parent, title) {
  const box = node("div", "", "panel");
  if (title) box.append(node("h3", title));
  parent.append(box);
  return box;
}
export function metricGrid(items) {
  const grid = node("div", "", "staff-cards");
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
  const wrap = node("div", "", "table-wrap");
  const t = document.createElement("table");
  const head = document.createElement("thead");
  const hrow = document.createElement("tr");
  for (const [key, label] of columns) hrow.append(node("th", label));
  if (actions.length) hrow.append(node("th", "ดำเนินการ"));
  head.append(hrow);
  t.append(head);
  const body = document.createElement("tbody");
  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = node("td", "ไม่มีรายการในขณะนี้");
    cell.colSpan = columns.length + (actions.length ? 1 : 0);
    row.append(cell);
    body.append(row);
  }
  for (const item of rows) {
    const row = document.createElement("tr");
    for (const [key] of columns)
      row.append(
        node(
          "td",
          String(
            typeof key === "function"
              ? key(item)
              : key === "status"
                ? bookingStatusLabel(item[key])
                : (item[key] ?? "—"),
          ),
        ),
      );
    if (actions.length) {
      const cell = document.createElement("td");
      cell.style.whiteSpace = "nowrap";
      for (const action of actions) {
        if (action.when && !action.when(item)) continue;
        const button = node("button", action.label, "btn btn-outline");
        button.type = "button";
        button.addEventListener("click", async () => {
          if (action.confirm && !confirm(action.confirm(item))) return;
          busy(button, true);
          try {
            await action.run(item);
            status(feedback, action.success || "บันทึกแล้ว", "success");
            await action.refresh?.();
          } catch (error) {
            status(feedback, error.message, "error");
          } finally {
            busy(button, false);
          }
        });
        cell.append(button, " ");
      }
      row.append(cell);
    }
    body.append(row);
  }
  t.append(body);
  wrap.append(t);
  parent.append(wrap);
  return wrap;
}
export function form(parent, title, fields, onSubmit, buttonText = "บันทึก") {
  const box = node("details", "", "staff-form-disclosure");
  const summary = node("summary", `+ ${title}`);
  box.append(summary);
  parent.append(box);
  const f = node("form", "", "inline-form panel");
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
    if (spec.value !== undefined) input.value = spec.value;
    if (spec.min !== undefined) input.min = spec.min;
    if (spec.max !== undefined) input.max = spec.max;
    if (spec.placeholder) input.placeholder = spec.placeholder;
    inputs[spec.name] = input;
    wrap.append(label, input);
    f.append(wrap);
  }
  const button = node("button", buttonText, "btn btn-primary");
  button.type = "submit";
  f.append(button);
  f.addEventListener("submit", async (event) => {
    event.preventDefault();
    busy(button, true);
    try {
      const values = {};
      for (const [name, input] of Object.entries(inputs))
        values[name] =
          input.type === "number" ? Number(input.value) : input.value;
      await onSubmit(values, inputs);
      status(feedback, "บันทึกแล้ว", "success");
      f.reset();
    } catch (error) {
      status(feedback, error.message, "error");
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
