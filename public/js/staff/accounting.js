import {
  api,
  clear,
  section,
  panel,
  metricGrid,
  roleOverview,
  table,
  form,
  note,
  baht,
} from "./common.js";

export async function render() {
  clear();
  const [payments, bookings, refunds, report, audit] = await Promise.all([
    api("/api/payments/pending"),
    api("/api/bookings"),
    api("/api/refunds"),
    api("/api/reports/financial"),
    api("/api/audit/financial"),
  ]);
  metricGrid([
    ["รับชำระจำลอง", baht(report.received)],
    ["คืนจำลอง", baht(report.refunded)],
    ["ยอดสุทธิจำลอง", baht(report.net)],
    ["รอตรวจ", report.pendingReviews],
  ]);
  const pending = section(
    "รายการรอตรวจ",
    "เปิดหลักฐาน ตรวจยอดและเลขการจอง แล้วรับรองหรือปฏิเสธพร้อมเหตุผล",
  );
  table(
    pending,
    [
      ["id", "#"],
      ["bookingId", "การจอง"],
      ["customerName", "ผู้จอง"],
      [(r) => baht(r.amount), "ยอด"],
      ["method", "ช่องทาง"],
      ["channelDetail", "ประเภท / ธนาคาร"],
      [(r) => `${r.waitingMinutes} นาที`, "รอมา"],
    ],
    payments,
    [
      {
        label: "หลักฐาน",
        readOnly: true,
        when: (r) => Boolean(r.evidencePath),
        run: async (r) =>
          window.open(
            `/api/uploads/${r.evidencePath.split("/").pop()}`,
            "_blank",
            "noopener",
          ),
      },
      {
        label: "รับรอง",
        intent: "primary",
        help: "รับรองยอดเพื่อให้รายการจองดำเนินต่อได้",
        run: (r) =>
          api(`/api/payments/${r.id}/review`, {
            method: "POST",
            body: { decision: "approved" },
          }),
        refresh: render,
        success: "รับรองยอดจำลองแล้ว",
      },
      {
        label: "ปฏิเสธ",
        intent: "danger",
        help: "ระบุเหตุผลเพื่อให้ผู้จองแก้ไขหลักฐาน",
        run: async (r) => {
          const reason = prompt("เหตุผลที่ปฏิเสธ");
          if (!reason) return false;
          await api(`/api/payments/${r.id}/review`, {
            method: "POST",
            body: { decision: "rejected", reason },
          });
        },
        refresh: render,
      },
    ],
  );
  const history = section(
    "การจองและยอดเรียกเก็บ",
    "เทียบยอดรวมและมัดจำของแต่ละการจองก่อนติดตามการชำระ",
  );
  table(
    history,
    [
      ["id", "#"],
      ["customerName", "ผู้จอง"],
      ["status", "สถานะ"],
      [(r) => baht(r.total), "ยอดรวม"],
      [(r) => baht(r.depositDue), "มัดจำ"],
    ],
    bookings,
  );
  const refundsSection = section(
    "คำขอคืนเงินจำลอง",
    "ส่งคำขอให้ฝ่ายบริหารอนุมัติ แล้วจึงบันทึกการคืนเงิน",
  );
  history.classList.add("staff-section-half");
  refundsSection.classList.add("staff-section-half");
  table(
    refundsSection,
    [
      ["id", "#"],
      ["booking_id", "การจอง"],
      ["customerName", "ผู้จอง"],
      [(r) => baht(r.amount), "ยอดคืน"],
      ["status", "สถานะ"],
      ["reason", "เหตุผล"],
    ],
    refunds,
    [
      {
        label: "บันทึกคืน",
        intent: "primary",
        help: "ใช้ได้เฉพาะคำขอที่ฝ่ายบริหารอนุมัติแล้ว",
        when: (r) => r.status === "approved",
        run: (r) => api(`/api/refunds/${r.id}/record`, { method: "POST" }),
        refresh: render,
        success: "บันทึกการคืนจำลองแล้ว",
      },
    ],
  );
  form(
    refundsSection,
    "สร้างคำขอคืนเงิน",
    [
      { name: "bookingId", label: "เลขการจอง", type: "number", min: 1 },
      {
        name: "reason",
        label: "เหตุผล",
        options: [
          ["guest_cancel", "ลูกค้ายกเลิก"],
          ["hotel_failure", "โรงแรมให้ห้องไม่ได้"],
        ],
      },
    ],
    async (values) => {
      await api("/api/refunds", { method: "POST", body: values });
      await render();
    },
    "ส่งคำขอ",
    { help: "ระบุเลขการจองและสาเหตุ ระบบคำนวณยอดคืนตามเงื่อนไขก่อนส่งอนุมัติ" },
  );
  note(refundsSection, "ฝ่ายบัญชีบันทึกคืนได้หลังฝ่ายบริหารอนุมัติเท่านั้น ไม่มีเงินเคลื่อนจริง");
  const auditSection = section(
    "ประวัติการเงิน",
    "แสดง 30 รายการล่าสุด พร้อมข้อมูลก่อนและหลังการเปลี่ยนแปลง",
  );
  table(
    auditSection,
    [
      ["createdAt", "เวลา"],
      ["actorEmail", "ผู้ทำ"],
      ["entity", "รายการ"],
      ["action", "การกระทำ"],
      [(r) => JSON.stringify(r.beforeValue ?? null), "ก่อน"],
      [(r) => JSON.stringify(r.afterValue ?? null), "หลัง"],
    ],
    audit.slice(0, 30),
  );
  roleOverview(
    "ตรวจชำระและติดตามการคืนเงิน",
    "ฝ่ายบัญชีรับรองหลักฐานและบันทึกคืนเงิน ส่วนการอนุมัติคืนเงินเป็นหน้าที่ฝ่ายบริหาร",
    [
      {
        label: "รอตรวจหลักฐาน",
        value: payments.length,
        target: pending,
        detail: "ตรวจยอดและหลักฐานก่อนรับรอง",
      },
      {
        label: "อนุมัติแล้ว รอบันทึกคืน",
        value: refunds.filter((item) => item.status === "approved").length,
        target: refundsSection,
        detail: "บันทึกคืนได้หลังฝ่ายบริหารอนุมัติ",
      },
      {
        label: "คำขอคืนที่รอตัดสินใจ",
        value: refunds.filter((item) => item.status === "requested").length,
        target: refundsSection,
        detail: "ติดตามสถานะคำขอที่ส่งให้ฝ่ายบริหาร",
      },
    ],
  );
}
