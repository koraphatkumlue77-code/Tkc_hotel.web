import { api } from "../api.js";
import { busy, status } from "../ui.js";
const form = document.querySelector("#staffLogin");
const message = document.querySelector("#loginStatus");
function rolePath(role) {
  return `/staff/${role}.html`;
}
async function check() {
  try {
    const me = await api("/api/me");
    if (me.role !== "member") location.href = rolePath(me.role);
  } catch {}
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  busy(button, true);
  try {
    const login = await api("/api/auth/login", {
      method: "POST",
      body: {
        email: form.querySelector("#email").value,
        password: form.querySelector("#password").value,
      },
    });
    if (login.role === "member") throw new Error("บัญชีสมาชิกใช้หน้าลูกค้า");
    location.href = rolePath(login.role);
  } catch (error) {
    status(message, error.message, "error");
  } finally {
    busy(button, false);
  }
});
check();
