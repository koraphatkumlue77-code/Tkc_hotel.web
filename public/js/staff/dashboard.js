import { api, node, clear, dashboard, feedback, status } from "./common.js";
const role = location.pathname.split("/").pop().replace(".html", "");
const titles = {
  superadmin: ["ผู้ดูแลระบบ", "จัดการห้องพัก ข้อมูลโรงแรม และเรื่องที่ต้องติดตาม"],
  reception: ["ฝ่ายต้อนรับ", "งานหน้าเคาน์เตอร์ การเข้าพัก และการติดต่อสมาชิก"],
  accounting: ["ฝ่ายบัญชี", "ตรวจรายการชำระและบันทึกคืนเงินจำลอง"],
  management: ["ฝ่ายบริหาร", "ภาพรวมโรงแรม สิทธิ์ โปรโมชั่น และการอนุมัติ"],
  housekeeping: ["แม่บ้าน", "คิวทำความสะอาดและรายงานความเสียหาย"],
};
async function start() {
  try {
    const me = await api("/api/me");
    if (me.role === "member") {
      location.href = "/account.html";
      return;
    }
    if (me.role !== role) {
      clear();
      status(feedback, "บัญชีนี้ไม่มีสิทธิ์เข้าพื้นที่ที่เลือก", "error");
      const link = node("a", "ไปพื้นที่ของฉัน →", "btn btn-dark");
      link.href = `/staff/${me.role}.html`;
      dashboard.append(link);
      return;
    }
    document.querySelector("#pageTitle").textContent = titles[role][0];
    document.querySelector("#pageSubtitle").textContent = titles[role][1];
    document.querySelector("#breadcrumb").textContent = titles[role][0];
    document.querySelector("#staffUser").textContent = me.email;
    document
      .querySelector(`#staffNav a[data-role="${role}"]`)
      .classList.add("active");
    for (const link of document.querySelectorAll("#staffNav a"))
      if (link.dataset.role !== role) link.hidden = true;
    const module = await import(`./${role}.js`);
    await module.render();
  } catch (error) {
    clear();
    status(feedback, error.message, "error");
    if (error.status === 401) {
      const link = node("a", "เข้าสู่ระบบพนักงาน →", "btn btn-dark");
      link.href = "/staff/index.html";
      dashboard.append(link);
    }
  }
}
document.querySelector("#staffLogout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/staff/index.html";
});
document.addEventListener("tkc:authlost", () => {
  clear();
  status(feedback, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", "error");
});
start();
