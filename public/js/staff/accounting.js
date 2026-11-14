import {
  api,
  clear,
  section,
  panel,
  metricGrid,
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
    "ระบบตรวจรูปแบบและยอดแล้ว ฝ่ายบัญชีต้องรับรองก่อนยืนยันการจอง",
  );
  table(
    pending,
    [
      ["id", "#"],
      ["bookingId", "การจอง"],
      ["customerName", "ผู้จอง"],
      [(r) => baht(r.amount), "ยอด"],
      ["method", "ช่องทาง"],
      [(r) => `${r.waitingMinutes} นาที`, "รอมา"],
    ],
    payments,
    [
      {
        label: "หลักฐาน",
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
        run: async (r) => {
          const reason = prompt("เหตุผลที่ปฏิเสธ");
          if (!reason) return;
          await api(`/api/payments/${r.id}/review`, {
            method: "POST",
            body: { decision: "rejected", reason },
          });
        },
        refresh: render,
      },
    ],
  );
  const history = section("การจองและยอดคงเหลือ");
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
  const refundsSection = section("คำขอคืนเงินจำลอง");
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
        when: (r) => r.status === "approved",
        run: (r) => api(`/api/refunds/${r.id}/record`, { method: "POST" }),
        refresh: render,
        success: "บันทึกการคืนจำลองแล้ว",
      },
    ],
  );
  form(
    refundsSection,
    "ส่งคำขอคืนเงินให้ฝ่ายบริหาร",
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
  );
  note(refundsSection, "ฝ่ายบัญชีบันทึกคืนได้หลังฝ่ายบริหารอนุมัติเท่านั้น ไม่มีเงินเคลื่อนจริง");
  const auditSection = section("ประวัติการเงิน");
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
}
