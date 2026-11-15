import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

class Element {
  constructor(tag = "div") {
    Object.assign(this, {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      attrs: {},
      events: {},
      style: {},
      _text: "",
      value: "",
      className: "",
      id: "",
      scrollHeight: 0,
      scrollTop: 0,
      clientHeight: 0,
      isConnected: true,
      hidden: false,
    });
    this.classList = {
      toggle: (value, on) => {
        const values = new Set(this.className.split(" "));
        on ? values.add(value) : values.delete(value);
        this.className = [...values].join(" ");
      },
    };
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((x) => x.textContent).join(" ");
  }
  get selectedOptions() {
    return [
      this.children.find((x) => x.value === this.value) || this.children[0],
    ];
  }
  append(...items) {
    for (const x of items) x.parentElement = this;
    this.children.push(...items);
  }
  prepend(...items) {
    for (const x of items) x.parentElement = this;
    this.children.unshift(...items);
  }
  replaceChildren(...items) {
    this._text = "";
    this.children = [];
    this.append(...items);
  }
  setAttribute(key, value) {
    this.attrs[key] = value;
    if (key === "class") this.className = value;
  }
  addEventListener(key, value) {
    this.events[key] = value;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.events.close?.();
  }
  scrollIntoView() {}
  focus() {
    document.activeElement = this;
  }
  closest(tag) {
    let x = this.parentElement;
    while (x) {
      if (x.tagName === tag.toUpperCase()) return x;
      x = x.parentElement;
    }
    return null;
  }
}
const walk = (root) => [root, ...root.children.flatMap(walk)];
const html = fs.readFileSync("public/account.html", "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((x) => x[1]);
const elements = Object.fromEntries(
  ids.map((id) => [id, Object.assign(new Element(), { id })]),
);
for (const value of ["all", "action", "upcoming", "closed"]) {
  const button = new Element("button");
  button.dataset.filter = value;
  elements.bookingFilters.append(button);
}
elements.accountChat.hidden = true;
const events = {};
const document = {
  createElement: (tag) => new Element(tag),
  createElementNS: (ns, tag) => new Element(tag),
  querySelector(query) {
    if (!query.startsWith("#")) return null;
    return (
      elements[query.slice(1)] ||
      Object.values(elements)
        .flatMap(walk)
        .find((e) => e.id === query.slice(1)) ||
      null
    );
  },
  addEventListener(key, value) {
    events[key] = value;
  },
};
globalThis.document = document;
const ui = await import(pathToFileURL(process.cwd() + "/public/js/ui.js"));
const location = {
  search: "?bookingId=1",
  hash: "",
  pathname: "/account.html",
  href: "http://localhost/account.html?bookingId=1",
  replace(value) {
    this.redirect = value;
  },
  assign(value) {
    this.redirect = value;
  },
};
const base = {
  check_in: "2027-01-01",
  check_out: "2027-01-03",
  hold_until: "2099-01-01T00:00:00Z",
  total: 1000,
  deposit_due: 500,
  paid: 0,
  balance: 1000,
  rooms: [{ typeName: "Suite", guests: 2 }],
  payments: [],
  services: [],
  tours: [],
  proposals: [],
};
const rows = [
  { ...base, id: 1, status: "held" },
  {
    ...base,
    id: 2,
    status: "pending_review",
    payments: [
      {
        id: 5,
        amount: 500,
        method: "online_demo",
        status: "pending_review",
        submittedAt: new Date().toISOString(),
      },
    ],
  },
  { ...base, id: 3, status: "confirmed" },
  { ...base, id: 4, status: "cancelled" },
  { ...base, id: 5, status: "held", hold_until: "2000-01-01T00:00:00Z" },
];
const calls = [],
  timers = new Map();
let timerId = 0,
  chatDeferred = null,
  chatMessages = [],
  failSend = false;
async function api(url, options) {
  calls.push([url, options]);
  if (url === "/api/me")
    return {
      id: 8,
      role: "member",
      fullName: "Guest",
      email: "guest@example.test",
    };
  if (url === "/api/bookings/mine")
    return rows.map((x) => ({
      id: x.id,
      status: x.status,
      checkIn: x.check_in,
      checkOut: x.check_out,
      holdUntil: x.hold_until,
      total: x.total,
    }));
  if (url.startsWith("/api/tours/slots")) return [];
  if (url.includes("/messages")) {
    if (options?.method === "POST") {
      if (failSend) throw new Error("Send failed");
      return {};
    }
    if (chatDeferred)
      return new Promise((resolve) => chatDeferred.push(resolve));
    return structuredClone(chatMessages);
  }
  if (url.endsWith("/payments") && options?.method === "POST") {
    const booking = rows.find((x) => x.id === Number(url.split("/")[3]));
    booking.status = "pending_review";
    booking.payments = [
      {
        id: 6,
        amount: options.body.amount,
        method: options.body.method,
        status: "pending_review",
        submittedAt: new Date().toISOString(),
      },
    ];
    return booking.payments[0];
  }
  if (url.startsWith("/api/bookings/"))
    return structuredClone(
      rows.find((x) => x.id === Number(url.split("/")[3])),
    );
  throw new Error("Unexpected API " + url);
}
const source = fs
  .readFileSync("public/js/account.js", "utf8")
  .replace(/import[\s\S]*?;/g, "")
  .replace(/\nloadMe\(\);\s*$/, "");
const controller = new Function(
  "api",
  "document",
  "location",
  "history",
  "setInterval",
  "clearInterval",
  ...Object.keys(ui),
  source +
    ";return {loadMe, loadDetail, renderBookingList, setBookingFilter, setChatOpen, loadChat};",
)(
  api,
  document,
  location,
  { replaceState() {} },
  (fn) => {
    timers.set(++timerId, fn);
    return timerId;
  },
  (id) => timers.delete(id),
  ...Object.values(ui),
);
const tick = () => new Promise(setImmediate),
  detail = () => walk(elements.bookingDetail);
await controller.loadMe();
assert.equal(elements.bookingList.children.length, 5);
assert.equal(calls.filter(([url]) => url.includes("/messages")).length, 0);
assert.equal(timers.size, 0);
assert.equal(elements.accountChat.hidden, true);
elements.bookingSearch.value = "#3";
await controller.renderBookingList();
assert.equal(elements.bookingList.children.length, 1);
assert.equal(elements.bookingList.children[0].dataset.bookingId, 3);
assert.ok(detail().some((x) => x.id === "bookingPayment"));
elements.bookingSearch.value = "";
controller.setBookingFilter("action");
await tick();
assert.deepEqual(
  elements.bookingList.children.map((x) => x.dataset.bookingId),
  [1, 2],
);
controller.setBookingFilter("closed");
await tick();
assert.deepEqual(
  elements.bookingList.children.map((x) => x.dataset.bookingId),
  [4, 5],
);
assert.ok(!detail().some((x) => x.id === "bookingPayment"));
elements.bookingSearch.value = "no-match";
await controller.renderBookingList();
assert.equal(elements.bookingDetail.attrs["aria-busy"], "false");
assert.ok(!detail().some((x) => x.id === "bookingPayment"));
elements.bookingSearch.value = "";
controller.setBookingFilter("all");
await tick();
const payment = detail().find((x) => x.id === "bookingPayment");
detail().find((x) => x.id === "balanceMethod").value = "online_demo";
detail().find((x) => x.id === "balanceOnlineChoice").value = "paypal";
const beforePayment = calls.filter(([url]) => url.endsWith("/payments")).length;
let paymentAttempt = payment.events.submit({ preventDefault() {} });
assert.equal(elements["payment-confirm"].open, true);
assert.equal(elements["payment-confirm-channel"].textContent, "PayPal");
assert.match(elements["payment-confirm-amount"].textContent, /1,000/);
assert.equal(
  calls.filter(([url]) => url.endsWith("/payments")).length,
  beforePayment,
);
elements["payment-confirm"].returnValue = "cancel";
elements["payment-confirm"].close();
await paymentAttempt;
assert.equal(
  calls.filter(([url]) => url.endsWith("/payments")).length,
  beforePayment,
);
paymentAttempt = payment.events.submit({ preventDefault() {} });
elements["payment-confirm"].returnValue = "confirm";
elements["payment-confirm"].close();
await paymentAttempt;
assert.equal(
  calls.filter(([url]) => url.endsWith("/payments")).length,
  beforePayment + 1,
);
assert.match(elements.accountStatus.textContent, /รอฝ่ายบัญชีตรวจสอบ/);
assert.equal(rows[0].paid, 0);
assert.ok(!detail().some((x) => x.id === "bookingPayment"));
await controller.setChatOpen(true);
assert.equal(timers.size, 1);
assert.equal(elements.accountChat.hidden, false);
assert.equal(elements.chatLauncher.attrs["aria-expanded"], "true");
chatMessages = [{ id: 1, senderId: 8, senderRole: "member", content: "สวัสดี" }];
await controller.loadChat();
assert.match(elements.chatLog.textContent, /ส่งถึงระบบแล้ว รอฝ่ายต้อนรับตอบ/);
chatMessages.push({
  id: 2,
  senderId: 9,
  senderRole: "reception",
  content: "สวัสดีครับ",
});
await controller.loadChat();
assert.doesNotMatch(elements.chatLog.textContent, /ส่งถึงระบบแล้ว รอฝ่ายต้อนรับตอบ/);
chatMessages = [];
failSend = true;
const send = new Element("button");
elements.chatMessage.value = "Help";
await elements.chatForm.events.submit({ preventDefault() {}, submitter: send });
assert.ok(elements.chatStatus.textContent.includes("Send failed"));
assert.equal(send.disabled, false);
assert.equal(elements.chatMessage.value, "Help");
document.activeElement = new Element("body");
assert.equal(
  typeof events.keydown,
  "function",
  "Escape remains available when a send button loses focus",
);
events.keydown({ key: "Escape", preventDefault() {} });
assert.equal(elements.accountChat.hidden, true);
assert.equal(document.activeElement, elements.chatLauncher);
failSend = false;
await controller.setChatOpen(false, true);
assert.equal(timers.size, 0);
assert.equal(document.activeElement, elements.chatLauncher);
chatDeferred = [];
const open1 = controller.setChatOpen(true);
await controller.setChatOpen(false);
const open2 = controller.setChatOpen(true);
chatDeferred[0]([{ id: 88, senderId: 8, content: "Old response" }]);
await open1;
assert.equal(timers.size, 0);
await controller.setChatOpen(false);
chatDeferred[1]([]);
await open2;
assert.equal(timers.size, 0);
assert.ok(!elements.chatLog.textContent.includes("Old response"));
chatDeferred = null;
await controller.setChatOpen(true);
assert.equal(timers.size, 1);
events["tkc:authlost"]();
assert.equal(timers.size, 0);
assert.equal(elements.accountChat.hidden, true);
assert.equal(elements.chatLauncher.hidden, true);
assert.equal(elements.chatLog.children.length, 0);
assert.ok(location.redirect.startsWith("/?login=1&next="));
console.log(
  "PASS: search, action/closed filters, empty result/reset state, payment pending guard, initially closed chat, open-only polling, send failure recovery, close focus, stale open/close race, authloss cleanup.",
);
