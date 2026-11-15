import { api, node, clear, dashboard, feedback, status } from "./common.js";
import { hasUnsavedInput, startStaffLive } from "./live.js";
const role = location.pathname.split("/").pop().replace(".html", "");
const titles = {
  superadmin: ["ผู้ดูแลระบบ", "จัดการห้องพัก ข้อมูลโรงแรม และเรื่องที่ต้องติดตาม"],
  reception: ["ฝ่ายต้อนรับ", "งานหน้าเคาน์เตอร์ การเข้าพัก และการติดต่อสมาชิก"],
  accounting: ["ฝ่ายบัญชี", "ตรวจรายการชำระและบันทึกคืนเงินจำลอง"],
  management: ["ฝ่ายบริหาร", "ภาพรวมโรงแรม สิทธิ์ โปรโมชั่น และการอนุมัติ"],
  housekeeping: ["แม่บ้าน", "คิวทำความสะอาดและรายงานความเสียหาย"],
};
let loading = false;
let liveStarted = false;
let lastInteraction = Date.now();
async function start() {
  if (loading) return;
  loading = true;
  clear();
  status(feedback, "");
  try {
    const me = await api("/api/me");
    if (me.role === "member") {
      location.href = "/account.html";
      return;
    }
    if (me.role !== role) {
      clear();
      dashboard.setAttribute("aria-busy", "false");
      document.querySelector("#pageTitle").textContent = "ไม่สามารถเปิดพื้นที่นี้ได้";
      status(feedback, "บัญชีนี้ไม่มีสิทธิ์เข้าพื้นที่ที่เลือก", "error");
      const link = node("a", "ไปพื้นที่ของฉัน", "btn btn-dark");
      link.href = `/staff/${me.role}.html`;
      dashboard.append(link);
      return;
    }
    document.querySelector("#pageTitle").textContent = titles[role][0];
    document.querySelector("#pageSubtitle").textContent = titles[role][1];
    document.querySelector("#breadcrumb").textContent = titles[role][0];
    document.title = `${titles[role][0]} | TKC Hotel`;
    document.querySelector("#staffUser").textContent = me.email;
    document
      .querySelector(`#staffNav a[data-role="${role}"]`)
      .classList.add("active");
    document
      .querySelector(`#staffNav a[data-role="${role}"]`)
      .setAttribute("aria-current", "page");
    for (const link of document.querySelectorAll("#staffNav a"))
      if (link.dataset.role !== role) link.hidden = true;
    const module = await import(`./${role}.js`);
    await module.render();
    dashboard.setAttribute("aria-busy", "false");
    if (!liveStarted) {
      startStaffLive(role, dashboard);
      liveStarted = true;
    }
  } catch (error) {
    clear();
    dashboard.setAttribute("aria-busy", "false");
    document.querySelector("#pageTitle").textContent =
      error.status === 401 ? "กรุณาเข้าสู่ระบบ" : "โหลดพื้นที่ทำงานไม่สำเร็จ";
    status(feedback, error.message, "error");
    if (error.status === 401) {
      const link = node("a", "เข้าสู่ระบบ", "btn btn-dark");
      link.href = "/?login=1";
      dashboard.append(link);
    } else {
      const retry = node("button", "ลองโหลดอีกครั้ง", "btn btn-dark");
      retry.type = "button";
      retry.addEventListener("click", start);
      dashboard.append(retry);
    }
  } finally {
    loading = false;
  }
}
for (const eventName of ["pointerdown", "keydown", "input"]) {
  document.addEventListener(
    eventName,
    () => {
      lastInteraction = Date.now();
    },
    { passive: true },
  );
}
setInterval(() => {
  if (document.hidden || loading || Date.now() - lastInteraction < 60000)
    return;
  if (
    dashboard.contains(document.activeElement) ||
    dashboard.querySelector("details[open], .chat-panel") ||
    hasUnsavedInput(dashboard)
  )
    return;
  start();
}, 60000);
document
  .querySelector("#staffRefresh")
  .addEventListener("click", async (event) => {
    if (
      hasUnsavedInput(dashboard) &&
      !confirm("มีข้อมูลที่ยังไม่ได้บันทึก โหลดใหม่จะล้างข้อมูล ต้องการดำเนินการต่อหรือไม่?")
    )
      return;
    const button = event.currentTarget;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    await start();
    button.disabled = false;
    button.removeAttribute("aria-busy");
  });
document
  .querySelector("#staffLogout")
  .addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await api("/api/auth/logout", { method: "POST" });
      location.href = "/";
    } catch (error) {
      status(feedback, error.message, "error");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
document.addEventListener("tkc:authlost", () => {
  clear();
  dashboard.setAttribute("aria-busy", "false");
  status(feedback, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", "error");
  const link = node("a", "เข้าสู่ระบบ", "btn btn-dark");
  link.href = "/?login=1";
  dashboard.append(link);
});
start();
