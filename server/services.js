import { withTransaction } from "./db.js";
import { requireRole } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";
import { recordAudit } from "./audit.js";

export async function addServiceAfterCheckIn(
  connection,
  { bookingId, kind, date = null, actorId },
) {
  if (!["breakfast", "fitness", "sauna"].includes(kind))
    fail(400, "บริการไม่ถูกต้อง");
  const [[booking]] = await connection.execute(
    "SELECT * FROM bookings WHERE id=? FOR UPDATE",
    [bookingId],
  );
  if (!booking || booking.status !== "checked_in")
    fail(409, "เพิ่มบริการได้หลัง Check-in เท่านั้น");
  if (
    kind === "breakfast" &&
    (!date || date < booking.check_in || date >= booking.check_out)
  )
    fail(400, "วันอาหารเช้าไม่อยู่ในช่วงเข้าพัก");
  const [[existing]] = await connection.execute(
    "SELECT COUNT(*) AS amount FROM booking_services WHERE booking_id=? AND kind=? AND status='active' AND (service_date=? OR (? IS NULL AND service_date IS NULL))",
    [bookingId, kind, date, date],
  );
  if (existing.amount) fail(409, "บริการนี้ถูกเลือกแล้ว");
  const [rooms] = await connection.execute(
    "SELECT br.type_id,t.breakfast_price AS breakfastPrice FROM booking_rooms br JOIN room_types t ON t.id=br.type_id WHERE br.booking_id=?",
    [bookingId],
  );
  if (!rooms.length) fail(409, "ไม่พบห้องในรายการ");
  let charge = 0;
  for (const room of rooms) {
    const price =
      kind === "breakfast"
        ? Number(room.breakfastPrice)
        : kind === "fitness"
          ? 500
          : 300;
    charge += price;
    await connection.execute(
      "INSERT INTO booking_services (booking_id,kind,service_date,quantity,unit_price,total,created_by) VALUES (?,?,?,?,?,?,?)",
      [bookingId, kind, date, 1, price, price, actorId],
    );
  }
  await connection.execute(
    "UPDATE bookings SET total=total+?,service_subtotal=service_subtotal+? WHERE id=?",
    [charge, charge, bookingId],
  );
  await connection.execute(
    "INSERT INTO payments (booking_id,amount,method,status,auto_check,reviewed_at,reviewed_by) VALUES (?,?,'reception_demo','approved','Immediate service payment (simulated)',NOW(),?)",
    [bookingId, charge, actorId],
  );
  await recordAudit(connection, {
    actorId,
    action: "add_paid_service",
    entity: "booking",
    entityId: bookingId,
    after: { kind, date, charge, simulated: true },
  });
  return { bookingId, kind, date, charge, simulated: true };
}

export function serviceRoutes(app) {
  app.post(
    "/api/bookings/:id/services",
    requireRole("reception"),
    asyncRoute(async (req, res) =>
      res
        .status(201)
        .json(
          await withTransaction((c) =>
            addServiceAfterCheckIn(c, {
              bookingId: req.params.id,
              kind: req.body.kind,
              date: req.body.date,
              actorId: req.session.accountId,
            }),
          ),
        ),
    ),
  );
}
