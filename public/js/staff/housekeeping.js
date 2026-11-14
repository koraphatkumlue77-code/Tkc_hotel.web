import {
  api,
  node,
  clear,
  section,
  metricGrid,
  table,
  status,
  feedback,
  busy,
} from "./common.js";
export async function render() {
  clear();
  const [tasks, rooms] = await Promise.all([
    api("/api/housekeeping/tasks"),
    api("/api/rooms?limit=50"),
  ]);
  metricGrid([
    ["รอทำความสะอาด", tasks.filter((x) => x.status === "pending").length],
    ["กำลังทำ", tasks.filter((x) => x.status === "working").length],
    ["เสร็จแล้ว", tasks.filter((x) => x.status === "done").length],
    ["ห้องที่แสดง", rooms.length],
  ]);
  const work = section("คิวทำความสะอาด", "งานสร้างอัตโนมัติเมื่อ Check-out");
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
        label: "เริ่ม",
        when: (r) => r.status === "pending",
        run: (r) =>
          api(`/api/housekeeping/tasks/${r.id}/start`, { method: "POST" }),
        refresh: render,
      },
      {
        label: "ยืนยันเสร็จ",
        when: (r) => r.status === "working",
        run: (r) =>
          api(`/api/housekeeping/tasks/${r.id}/finish`, { method: "POST" }),
        refresh: render,
      },
    ],
  );
  const damage = section(
    "รายงานความเสียหาย",
    "การรายงานไม่ปิดห้องอัตโนมัติ ฝ่ายบริหารเป็นผู้พิจารณา",
  );
  const box = node("div", "", "panel");
  const form = node("form", "", "inline-form");
  const roomId = document.createElement("input");
  roomId.type = "number";
  roomId.min = 1;
  roomId.required = true;
  const details = document.createElement("textarea");
  details.required = true;
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/jpeg,image/png,image/webp";
  file.required = true;
  for (const [labelText, input] of [
    ["รหัสห้อง", roomId],
    ["รายละเอียด", details],
    ["รูปตัวอย่าง", file],
  ]) {
    const wrap = node("div");
    const label = node("label", labelText);
    wrap.append(label, input);
    form.append(wrap);
  }
  const button = node("button", "ส่งรายงาน", "btn btn-primary");
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
  const roomsSection = section("ห้องพัก");
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
}
