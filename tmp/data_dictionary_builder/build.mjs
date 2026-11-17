import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = "/Users/korraphatmac/Tkc_hotel.web";
const outputDir = `${root}/outputs/01a1df93-01ee-72f1-8d12-f40f4681bb1f`;
const dbml = await fs.readFile(`${root}/database/tkc_hotel.dbml`, "utf8");

const tableThai = {
  AuditLog: "บันทึกการตรวจสอบ", Booking: "การจอง", BookingPromotion: "โปรโมชั่นของการจอง",
  BookingRoom: "รายการห้องในใบจอง", BookingService: "บริการในใบจอง", ChatMessage: "ข้อความแชต",
  Customer: "ลูกค้า", Employee: "พนักงาน", Payment: "การชำระเงินและคืนเงิน",
  Promotion: "โปรโมชั่น", Review: "รีวิว", Room: "ห้องพัก", RoomAssignment: "ประวัติการจัดห้อง",
  RoomEvent: "เหตุการณ์ห้องพัก", RoomType: "ประเภทห้องพัก", Service: "บริการ",
  ServiceUsage: "รายละเอียดการใช้บริการ", TourReservation: "ผู้เข้าร่วมทัวร์", TourRound: "รอบทัวร์"
};

const meanings = {
  audit_log_id: "รหัสบันทึกการตรวจสอบ", entity_type: "ประเภทข้อมูลที่ถูกดำเนินการ",
  entity_id: "รหัสรายการข้อมูลที่ถูกดำเนินการ", action: "ชื่อการกระทำที่เกิดขึ้น",
  actor_type: "ประเภทผู้ดำเนินการ: ระบบ ลูกค้า หรือพนักงาน", actor_customer_id: "รหัสลูกค้าที่ดำเนินการ",
  actor_employee_id: "รหัสพนักงานที่ดำเนินการ", before_data: "ข้อมูลก่อนเปลี่ยนแปลงในรูปแบบ JSON",
  after_data: "ข้อมูลหลังเปลี่ยนแปลงในรูปแบบ JSON", reason: "เหตุผลหรือหมายเหตุของการดำเนินการ",
  booking_id: "รหัสการจอง", booking_code: "เลขอ้างอิงการจองที่แสดงแก่ผู้ใช้",
  customer_id: "รหัสลูกค้า/ผู้จอง", status_changed_at: "วันที่และเวลาที่เปลี่ยนสถานะล่าสุด",
  status_changed_by: "รหัสพนักงานที่เปลี่ยนสถานะล่าสุด", channel: "ช่องทางการจอง เช่น ONLINE หรือ WALK_IN",
  check_in_date: "วันที่กำหนดเข้าพัก", check_out_date: "วันที่กำหนดออกจากที่พัก",
  expected_arrival_at: "วันและเวลาที่ลูกค้าแจ้งว่าจะมาถึง", hold_expires_at: "เวลาสิ้นสุดการกันห้องเพื่อรอชำระเงิน",
  proof_sent_at: "วันที่และเวลาที่ส่งหลักฐานการชำระเงิน", deposit_rate: "อัตราร้อยละของเงินมัดจำ",
  room_subtotal_snapshot: "ยอดค่าห้องก่อนส่วนลด ณ เวลาจอง", service_subtotal_snapshot: "ยอดค่าบริการ ณ เวลาจอง",
  discount_total_snapshot: "ยอดส่วนลดรวม ณ เวลาจอง", total_snapshot: "ยอดรวมสุทธิ ณ เวลาจอง",
  actual_check_in_at: "วันและเวลา Check-in จริง", actual_check_out_at: "วันและเวลา Check-out จริง",
  checked_in_by: "รหัสพนักงานที่ทำ Check-in", checked_out_by: "รหัสพนักงานที่ทำ Check-out",
  booking_promotion_id: "รหัสรายการโปรโมชั่นที่ใช้กับการจอง", promotion_id: "รหัสโปรโมชั่น",
  sequence_no: "ลำดับการนำโปรโมชั่นมาคำนวณ", percent_snapshot: "เปอร์เซ็นต์ส่วนลด ณ เวลาที่ใช้",
  base_amount_before: "ยอดฐานก่อนใช้โปรโมชั่น", discount_amount: "จำนวนเงินส่วนลด",
  base_amount_after: "ยอดคงเหลือหลังใช้โปรโมชั่น", applied_at: "วันที่และเวลาที่ใช้โปรโมชั่น",
  booking_room_id: "รหัสรายการห้องในใบจอง", room_type_id: "รหัสประเภทห้องพัก",
  guest_count: "จำนวนผู้เข้าพักในห้อง", nightly_rate_snapshot: "ราคาต่อคืน ณ เวลาจอง",
  net_amount: "ยอดสุทธิของรายการห้อง", booking_service_id: "รหัสบริการที่เลือกในใบจอง",
  service_id: "รหัสบริการ", added_by: "รหัสพนักงานที่เพิ่มบริการ", selected_at: "วันที่และเวลาที่เลือกบริการ",
  message_id: "รหัสข้อความ", sender_type: "ประเภทผู้ส่ง: ลูกค้า หรือพนักงาน",
  sender_employee_id: "รหัสพนักงานผู้ส่งข้อความ", message_text: "เนื้อหาข้อความ",
  sent_at: "วันที่และเวลาที่ส่งข้อความ", read_at: "วันที่และเวลาที่อ่านข้อความ",
  user_id: "รหัสบัญชีเดิมของลูกค้า (Legacy; ไม่มี Foreign Key)", full_name: "ชื่อและนามสกุลลูกค้า",
  email: "อีเมลสำหรับเข้าสู่ระบบและติดต่อ", phone: "หมายเลขโทรศัพท์",
  identity_type: "ประเภทเอกสารยืนยันตัวตน", identity_number: "เลขเอกสาร เช่น บัตรประชาชนหรือหนังสือเดินทาง",
  password_hash: "รหัสผ่านที่ผ่านการ Hash แล้ว", member_status: "สถานะสมาชิก: WALK_IN, ACTIVE หรือ SUSPENDED",
  registered_at: "วันที่และเวลาที่สมัครสมาชิก", last_login_at: "วันที่และเวลาเข้าสู่ระบบล่าสุด",
  active: "สถานะเปิดใช้งานรายการ", employee_id: "รหัสพนักงาน", department_name: "ชื่อแผนก",
  role_name: "บทบาทและสิทธิ์ของพนักงาน", name: "ชื่อรายการ", payment_id: "รหัสธุรกรรมการเงิน",
  related_payment_id: "รหัสธุรกรรมต้นทางที่เกี่ยวข้อง เช่น รายการรับเงินของการคืนเงิน",
  transaction_type: "ประเภทธุรกรรม เช่น มัดจำ ยอดคงเหลือ หรือคืนเงิน", direction: "ทิศทางเงินเข้า IN เงินออก OUT หรือ NONE",
  verified_by: "รหัสพนักงานบัญชีผู้ตรวจสอบ", method: "วิธีชำระหรือคืนเงิน",
  amount: "จำนวนเงินของธุรกรรม", proof_reference: "ตำแหน่งอ้างอิงไฟล์หลักฐานแบบ Private",
  submitted_at: "วันที่และเวลาที่ส่งรายการ", auto_check_result: "ผลตรวจหลักฐานอัตโนมัติ",
  verified_at: "วันที่และเวลาที่ตรวจสอบ", requested_by: "รหัสพนักงานผู้ขอคืนเงิน",
  requested_at: "วันที่และเวลาที่ขอคืนเงิน", request_reason: "เหตุผลในการขอคืนเงิน",
  approved_by: "รหัสพนักงานผู้อนุมัติ", approved_at: "วันที่และเวลาที่อนุมัติ",
  processed_by: "รหัสพนักงานผู้ดำเนินการจ่าย", processed_at: "วันที่และเวลาที่ดำเนินการเสร็จ",
  rejection_reason: "เหตุผลที่ปฏิเสธ", idempotency_key: "คีย์ป้องกันการสร้างธุรกรรมซ้ำ",
  code: "รหัสโปรโมชั่นสำหรับกรอกใช้งาน", discount_percent: "เปอร์เซ็นต์ส่วนลด",
  priority: "ลำดับความสำคัญในการคำนวณ", valid_from: "วันและเวลาเริ่มใช้โปรโมชั่น",
  valid_until: "วันและเวลาสิ้นสุดโปรโมชั่น", created_by: "รหัสพนักงานผู้สร้างรายการ",
  review_id: "รหัสรีวิว", rating: "คะแนนรีวิว 1–5 ดาว", content: "ข้อความรีวิว",
  hidden_by: "รหัสพนักงานที่ซ่อนรีวิว", hidden_at: "วันที่และเวลาที่ซ่อนรีวิว",
  hidden_reason: "เหตุผลที่ซ่อนรีวิว", room_id: "รหัสห้องพัก", room_code: "หมายเลขหรือรหัสห้องที่แสดงใช้งาน",
  current_status: "สถานะปัจจุบันของห้อง", status_reason: "เหตุผลของสถานะปัจจุบัน",
  status_version: "เลขเวอร์ชันสำหรับป้องกันการแก้ไขสถานะชนกัน", area: "พื้นที่หรือโซนของห้อง",
  damage_item: "สิ่งของหรือจุดที่เสียหายล่าสุด", damage_description: "รายละเอียดความเสียหายล่าสุด",
  damage_photo_reference: "ตำแหน่งอ้างอิงรูปความเสียหาย", damage_reported_at: "วันที่และเวลารายงานความเสียหาย",
  damage_reported_by: "รหัสพนักงานผู้รายงานความเสียหาย", assignment_id: "รหัสประวัติการจัดหรือย้ายห้อง",
  assigned_by: "รหัสพนักงานผู้จัดห้อง", effective_from: "วันและเวลาเริ่มมีผล",
  effective_to: "วันและเวลาสิ้นสุดผล", assigned_at: "วันที่และเวลาที่สร้างรายการจัดห้อง",
  room_event_id: "รหัสเหตุการณ์ห้องพัก", event_type: "ประเภทเหตุการณ์ เช่น ทำความสะอาด เสียหาย หรือปิดห้อง",
  related_event_id: "รหัสเหตุการณ์ต้นทางที่สัมพันธ์กัน", item: "สิ่งของหรือหัวข้อของเหตุการณ์",
  description: "รายละเอียดของรายการ", photo_reference: "ตำแหน่งอ้างอิงรูปภาพแบบ Private",
  started_at: "วันที่และเวลาเริ่มงาน", completed_at: "วันที่และเวลาทำงานเสร็จ",
  type_name: "ชื่อประเภทห้องพัก", capacity: "จำนวนสูงสุดที่รองรับ",
  price_per_night: "ราคาห้องต่อคืน", breakfast_daily_rate: "ราคาอาหารเช้าต่อห้องต่อวัน",
  service_kind: "หมวดบริการ เช่น อาหารเช้า ฟิตเนส ซาวน่า ทัวร์", image_reference: "ตำแหน่งอ้างอิงรูปบริการ",
  season: "ฤดูกาลหรือช่วงเวลาที่ให้บริการ", visible: "กำหนดว่าจะแสดงบริการบนหน้าเว็บหรือไม่",
  schedule_json: "ตารางเวลาให้บริการในรูปแบบ JSON", charge_unit: "หน่วยที่ใช้คิดราคา",
  default_rate: "ราคาเริ่มต้นของบริการ", included_in_room: "ระบุว่ารวมอยู่ในค่าห้องหรือไม่",
  service_usage_id: "รหัสรายละเอียดการใช้บริการ", usage_date: "วันที่ใช้บริการ",
  unit_price_snapshot: "ราคาต่อหน่วย ณ เวลาที่บันทึก", quantity: "จำนวนหน่วยที่ใช้",
  tour_reservation_id: "รหัสผู้เข้าร่วมทัวร์", tour_round_id: "รหัสรอบทัวร์",
  participant_code: "รหัสผู้เข้าร่วมที่ไม่ซ้ำในรอบ", participant_name: "ชื่อผู้เข้าร่วมทัวร์",
  usage_sequence_for_day: "ลำดับการใช้สิทธิ์ทัวร์ของวันนั้น", recorded_by: "รหัสพนักงานผู้บันทึก",
  tour_date: "วันที่จัดทัวร์", start_time: "เวลาเริ่มรอบทัวร์",
  created_at: "วันที่และเวลาที่สร้างข้อมูล", updated_at: "วันที่และเวลาที่แก้ไขข้อมูลล่าสุด"
};

const tableSpecific = {
  "Booking.status": "สถานะวงจรการจอง เช่น PENDING_PAYMENT, CONFIRMED, CHECKED_IN หรือ CHECKED_OUT",
  "BookingService.status": "สถานะบริการที่เลือกในใบจอง",
  "Payment.status": "สถานะการตรวจสอบหรือดำเนินการธุรกรรม",
  "Review.status": "สถานะรีวิว: PUBLISHED หรือ HIDDEN",
  "RoomEvent.status": "สถานะงานหรือเหตุการณ์ห้องพัก",
  "ServiceUsage.status": "สถานะรายละเอียดการใช้บริการ",
  "TourReservation.status": "สถานะผู้เข้าร่วมและการชำระเงิน",
  "TourRound.status": "สถานะรอบทัวร์: OPEN, CLOSED หรือ CANCELLED",
  "Promotion.name": "ชื่อโปรโมชั่น", "Service.name": "ชื่อบริการ", "Employee.name": "ชื่อและนามสกุลพนักงาน"
};

function parseEnums(source) {
  const result = new Map();
  const re = /Enum "([^"]+)" \{([\s\S]*?)\n\}/g;
  for (const match of source.matchAll(re)) {
    result.set(match[1], [...match[2].matchAll(/^\s+"([^"]+)"/gm)].map(value => value[1]));
  }
  return result;
}

function parseTables(source) {
  const lines = source.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    const start = /^Table "([^"]+)" \{$/.exec(lines[i]);
    if (!start) continue;
    const table = { name: start[1], fields: [], unique: new Set() };
    let depth = 1;
    let section = "fields";
    for (i += 1; i < lines.length && depth > 0; i += 1) {
      const line = lines[i];
      if (/^\s+Indexes \{$/.test(line)) section = "indexes";
      if (section === "fields") {
        const field = /^\s+"([^"]+)"\s+([^\s\[]+)(?:\s+\[([^\]]+)\])?$/.exec(line);
        if (field) table.fields.push({ name: field[1], type: field[2], attrs: field[3] || "" });
      } else {
        const unique = /^\s+(?:\(([^)]+)\)|([^\s]+))\s+\[unique/.exec(line);
        if (unique) {
          const names = (unique[1] || unique[2]).split(",").map(value => value.trim().replaceAll('"', ''));
          names.forEach(name => table.unique.add(name));
        }
      }
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
    }
    i -= 1;
    tables.push(table);
  }
  return tables;
}

function parseRelations(source) {
  const result = new Map();
  const re = /^Ref "[^"]+":"([^"]+)"\."([^"]+)"\s+[^\s]+\s+"([^"]+)"\."([^"]+)"/gm;
  for (const match of source.matchAll(re)) {
    const [, parentTable, parentColumn, childTable, childColumn] = match;
    result.set(`${childTable}.${childColumn}`, `${parentTable}.${parentColumn}`);
  }
  return result;
}

const enums = parseEnums(dbml);
const tables = parseTables(dbml);
const relations = parseRelations(dbml);
if (tables.length !== 19 || relations.size !== 42) throw new Error(`Schema mismatch: ${tables.length} tables, ${relations.size} relations`);

function displayType(type) {
  const values = enums.get(type);
  return values ? `ENUM(${values.join(", ")})` : type.toUpperCase();
}

function displayDefault(field) {
  if (field.attrs.includes("increment")) return "ระบบสร้างรหัส (AUTO_INCREMENT)";
  const match = /default:\s*(?:`([^`]+)`|'([^']+)'|([^,]+))/.exec(field.attrs);
  if (match) {
    const value = (match[1] || match[2] || match[3]).trim();
    if (value === "CURRENT_TIMESTAMP") return "เวลาปัจจุบัน (CURRENT_TIMESTAMP)";
    if (value === "1" && /BOOL|TINYINT/i.test(field.type)) return "1 (TRUE)";
    if (value === "0" && /BOOL|TINYINT/i.test(field.type)) return "0 (FALSE)";
    return value;
  }
  return field.attrs.includes("not null") || field.attrs.includes("pk") ? "—" : "NULL";
}

function displayKey(table, field) {
  const labels = [];
  if (field.attrs.includes("pk")) labels.push("PK");
  if (relations.has(`${table.name}.${field.name}`)) labels.push("FK");
  if (table.unique.has(field.name)) labels.push("UQ");
  return labels.join(" / ") || "-";
}

function meaning(table, field) {
  return tableSpecific[`${table.name}.${field.name}`] || meanings[field.name] || `ข้อมูล ${field.name} ของตาราง ${table.name}`;
}

const workbook = Workbook.create();
const fontName = "Arial";
const headerFills = ["#F4CCCC", "#FFD966", "#00E600", "#FF00FF", "#E7A4E8", "#9FC5E8", "#B7D7E8"];

for (const table of tables) {
  const sheet = workbook.worksheets.add(table.name);
  sheet.showGridLines = false;
  sheet.tabColor = "#00DCE6";
  sheet.mergeCells("A1:G1");
  sheet.getRange("A1").values = [[`${table.name} (${tableThai[table.name]})`]];
  sheet.getRange("A2:G2").values = [[
    "Attribute (ชื่อคอลัมน์)", "Data Type", "Key", "ว่างได้ไหม", "ค่าเริ่มต้น", "ความหมาย", "ความสัมพันธ์"
  ]];

  const rows = table.fields.map(field => {
    const relation = relations.get(`${table.name}.${field.name}`);
    return [
      field.name,
      displayType(field.type),
      displayKey(table, field),
      field.attrs.includes("not null") || field.attrs.includes("pk") ? "ไม่ได้" : "ได้",
      displayDefault(field),
      meaning(table, field),
      relation ? `FK → ${relation} (หลายต่อหนึ่ง)` : "-"
    ];
  });
  const endRow = rows.length + 2;
  sheet.getRange(`A3:G${endRow}`).values = rows;

  const title = sheet.getRange("A1:G1");
  title.format.fill = "#00DCE6";
  title.format.font = { name: fontName, size: 16, bold: true, color: "#000000" };
  title.format.horizontalAlignment = "center";
  title.format.verticalAlignment = "center";
  title.format.rowHeight = 32;

  for (let col = 0; col < 7; col += 1) {
    const cell = sheet.getCell(1, col);
    cell.format.fill = headerFills[col];
    cell.format.font = { name: fontName, size: 11, bold: true, color: "#000000" };
    cell.format.horizontalAlignment = "center";
    cell.format.verticalAlignment = "center";
  }

  const used = sheet.getRange(`A1:G${endRow}`);
  used.format.font = { name: fontName, size: 11, color: "#111111" };
  used.format.verticalAlignment = "center";
  used.format.borders = { preset: "all", style: "thin", color: "#333333" };
  sheet.getRange(`A1:G2`).format.font = { name: fontName, bold: true, color: "#000000" };
  sheet.getRange(`A3:A${endRow}`).format.font = { name: fontName, bold: true, color: "#111111" };
  sheet.getRange(`B3:E${endRow}`).format.horizontalAlignment = "center";
  sheet.getRange(`B3:B${endRow}`).format.wrapText = true;
  sheet.getRange(`F3:G${endRow}`).format.wrapText = true;
  sheet.getRange(`A3:G${endRow}`).format.rowHeight = 44;
  sheet.getRange("A2:G2").format.rowHeight = 34;

  sheet.getRange(`A3:G${endRow}`).conditionalFormats.addCustom("=MOD(ROW(),2)=0", { fill: "#F7F7F7" });
  sheet.getRange("A:A").format.columnWidth = 25;
  sheet.getRange("B:B").format.columnWidth = 52;
  sheet.getRange("C:C").format.columnWidth = 14;
  sheet.getRange("D:D").format.columnWidth = 14;
  sheet.getRange("E:E").format.columnWidth = 31;
  sheet.getRange("F:F").format.columnWidth = 52;
  sheet.getRange("G:G").format.columnWidth = 52;
  sheet.freezePanes.freezeRows(2);
}

workbook.recalculate();
await fs.mkdir(`${outputDir}/previews`, { recursive: true });
for (const table of tables) {
  const preview = await workbook.render({ sheetName: table.name, autoCrop: "all", scale: 0.8, format: "png" });
  await fs.writeFile(`${outputDir}/previews/${table.name}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const inspection = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 12000,
  tableMaxRows: 6,
  tableMaxCols: 7,
});
await fs.writeFile(`${outputDir}/inspection.ndjson`, inspection.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(`${outputDir}/errors.ndjson`, errors.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/TKC_Hotel_Data_Dictionary.xlsx`);
console.log(JSON.stringify({ output: `${outputDir}/TKC_Hotel_Data_Dictionary.xlsx`, sheets: tables.length, relationships: relations.size }));
