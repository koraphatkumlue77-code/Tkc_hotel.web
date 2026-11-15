import {
  api,
  node,
  clear,
  section,
  metricGrid,
  roleOverview,
  table,
  status,
  feedback,
  busy,
} from "./common.js";
export async function render() {
  clear();
  const [tasks, rooms, me] = await Promise.all([
    api("/api/housekeeping/tasks"),
    api("/api/rooms?limit=50"),
    api("/api/me"),
  ]);
  metricGrid([
    ["รอทำความสะอาด", tasks.filter((x) => x.status === "pending").length],
    ["กำลังทำ", tasks.filter((x) => x.status === "working").length],
    ["เสร็จแล้ว", tasks.filter((x) => x.status === "done").length],
    ["ห้องที่แสดง", rooms.length],
  ]);
  const work = section(
    "คิวทำความสะอาด",
    "งานเข้าคิวหลังเช็คเอาท์ กดเริ่มเมื่อเข้าห้อง และยืนยันเสร็จเมื่อพร้อมส่งมอบ",
  );
  table(
    work,
    [
      ["id", "#"],
      ["code", "ห้อง"],
      ["status", "สถานะ"],
      ["started_at", "เริ่ม"],
      ["finished_at", "เสร็จ"],
    ],
    tasks,
    [
      {
        label: "เริ่มงาน",
        intent: "primary",
        when: (r) => r.status === "pending",
        run: (r) =>
          api(`/api/housekeeping/tasks/${r.id}/start`, { method: "POST" }),
        refresh: render,
      },
      {
        label: "ยืนยันเสร็จ",
        intent: "primary",
        help: "ตรวจความสะอาดและความพร้อมของห้องก่อนยืนยัน",
        when: (r) =>
          r.status === "working" && Number(r.employee_id) === Number(me.id),
        run: (r) =>
          api(`/api/housekeeping/tasks/${r.id}/finish`, { method: "POST" }),
        refresh: render,
      },
    ],
  );
  const damage = section(
    "รายงานความเสียหาย",
    "แนบภาพและตำแหน่งที่เสียหาย ฝ่ายบริหารเป็นผู้พิจารณาปิดซ่อม",
  );
  const box = node("div", "", "panel");
  const form = node("form", "", "inline-form");
  form.setAttribute("aria-label", "ส่งรายงานความเสียหาย");
  const roomId = document.createElement("input");
  roomId.type = "number";
  roomId.min = 1;
  roomId.required = true;
  const details = document.createElement("textarea");
  details.required = true;
  details.placeholder = "เช่น ก๊อกอ่างล้างหน้ารั่ว บริเวณห้องน้ำ";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/jpeg,image/png,image/webp";
  file.required = true;
  const imageHelp = node(
    "p",
    "แนบภาพ JPEG, PNG หรือ WebP ที่เห็นความเสียหายชัดเจน",
    "field-hint",
  );
  imageHelp.id = "damage-image-hint";
  file.setAttribute("aria-describedby", imageHelp.id);
  for (const [labelText, input] of [
    ["รหัสห้อง", roomId],
    ["รายละเอียด", details],
    ["รูปตัวอย่าง", file],
  ]) {
    const wrap = node("div");
    const label = node("label", labelText);
    input.id =
      input === roomId
        ? "damage-room"
        : input === details
          ? "damage-details"
          : "damage-image";
    label.htmlFor = input.id;
    wrap.append(label, input);
    form.append(wrap);
  }
  form.append(imageHelp);
  const button = node("button", "ส่งให้ฝ่ายบริหาร", "btn btn-primary");
  button.type = "submit";
  form.append(button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    busy(button, true);
    try {
      const data = new FormData();
      data.append("file", file.files[0]);
      const uploaded = await api("/api/uploads", {
        method: "POST",
        body: data,
      });
      await api("/api/damage-reports", {
        method: "POST",
        body: {
          roomId: Number(roomId.value),
          details: details.value,
          imagePath: uploaded.path,
        },
      });
      status(feedback, "ส่งรายงานให้ฝ่ายบริหารแล้ว", "success");
      form.reset();
    } catch (error) {
      status(feedback, error.message, "error");
    } finally {
      busy(button, false);
    }
  });
  box.append(form);
  damage.append(box);
  const roomsSection = section(
    "สถานะห้องพัก",
    "ใช้เลขรหัสภายในจากคอลัมน์ # เมื่อต้องรายงานความเสียหาย",
  );
  damage.classList.add("staff-section-half");
  roomsSection.classList.add("staff-section-half");
  table(
    roomsSection,
    [
      ["id", "#"],
      ["code", "รหัส"],
      ["typeName", "ประเภท"],
      ["status", "สถานะ"],
    ],
    rooms,
  );
  const roomSearch = node("form", "", "field-row");
  const roomCode = document.createElement("input");
  roomCode.type = "search";
  roomCode.required = true;
  roomCode.placeholder = "ค้นหารหัสห้องทั้งหมด";
  roomCode.setAttribute("aria-label", "ค้นหารหัสห้องทั้งหมด");
  const searchButton = node("button", "ค้นหาห้อง", "btn btn-outline");
  searchButton.type = "submit";
  roomSearch.append(roomCode, searchButton);
  const searchResults = node("div");
  roomsSection.append(roomSearch, searchResults);
  roomSearch.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!roomCode.value.trim()) return;
    busy(searchButton, true);
    try {
      const matches = await api(
        `/api/rooms?code=${encodeURIComponent(roomCode.value.trim())}&limit=100`,
      );
      searchResults.replaceChildren();
      table(
        searchResults,
        [
          ["id", "#"],
          ["code", "รหัส"],
          ["typeName", "ประเภท"],
          ["status", "สถานะ"],
        ],
        matches,
      );
    } catch (error) {
      status(feedback, error.message, "error");
    } finally {
      busy(searchButton, false);
    }
  });
  roleOverview(
    "รับงานและส่งมอบห้องพร้อมใช้",
    "แม่บ้านเริ่มและจบงานทำความสะอาด พร้อมรายงานความเสียหาย การปิดซ่อมพิจารณาโดยฝ่ายบริหาร",
    [
      {
        label: "งานรอเริ่ม",
        value: tasks.filter((item) => item.status === "pending").length,
        target: work,
        detail: "เริ่มงานเมื่อเข้าทำความสะอาดห้อง",
      },
      {
        label: "งานที่กำลังทำ",
        value: tasks.filter((item) => item.status === "working").length,
        target: work,
        detail: "ตรวจความพร้อมก่อนยืนยันเสร็จ",
      },
      {
        label: "พบความเสียหาย",
        value: "ส่งรายงาน",
        target: damage,
        detail: "ระบุห้องและแนบภาพให้ฝ่ายบริหารตรวจสอบ",
      },
    ],
  );
}
