import { pool, withTransaction } from "./db.js";
import { getAvailability } from "./rooms.js";
import { quoteBooking, nightsBetween } from "./pricing.js";
import { asyncRoute, fail } from "./errors.js";
import { requireRole, requireUser } from "./auth.js";
import { recordAudit } from "./audit.js";

export async function expireBookingHolds(connection, now = new Date()) {
  const [rows] = await connection.execute(
    "SELECT id,status FROM bookings WHERE status='held' AND hold_until < ? FOR UPDATE",
    [now],
  );
  for (const row of rows)
    await setBookingStatus(
      connection,
      row.id,
      row.status,
      "cancelled",
      null,
      "หมดเวลากันห้อง",
    );
  return rows.length;
}

export async function setBookingStatus(
  connection,
  id,
  oldStatus,
  newStatus,
  actorId,
  reason = null,
) {
  await connection.execute("UPDATE bookings SET status=? WHERE id=?", [
    newStatus,
    id,
  ]);
  await connection.execute(
    "INSERT INTO booking_status_history (booking_id,old_status,new_status,actor_id,reason) VALUES (?,?,?,?,?)",
    [id, oldStatus, newStatus, actorId, reason],
  );
  await recordAudit(connection, {
    actorId,
    action: "status",
    entity: "booking",
    entityId: id,
    before: { status: oldStatus },
    after: { status: newStatus },
    reason,
  });
}

async function applicablePromotions(
  connection,
  { checkIn, checkOut, roomCount },
) {
  const nights = nightsBetween(checkIn, checkOut);
  const [rows] = await connection.execute(
    "SELECT id,name,percent_off AS percentOff,priority FROM promotions WHERE active=1 AND start_date<=? AND end_date>=? AND min_nights<=? AND min_rooms<=? ORDER BY priority,id",
    [checkIn, checkIn, nights, roomCount],
  );
  return rows;
}

async function pricedRooms(connection, rooms) {
  if (
    !Array.isArray(rooms) ||
    !rooms.length ||
    rooms.length > 20 ||
    rooms.some(
      (r) =>
        !Number.isInteger(Number(r.typeId)) ||
        !Number.isInteger(Number(r.guests)),
    )
  )
    fail(400, "รายการห้องไม่ถูกต้อง");
  const ids = [...new Set(rooms.map((r) => Number(r.typeId)))].sort(
    (a, b) => a - b,
  );
  const [types] = await connection.query(
    `SELECT id,capacity,nightly_price AS nightlyPrice,breakfast_price AS breakfastPrice FROM room_types WHERE active=1 AND id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  if (types.length !== ids.length) fail(400, "ประเภทห้องไม่ถูกต้อง");
  const byId = new Map(types.map((type) => [Number(type.id), type]));
  return rooms.map((room) => ({
    ...byId.get(Number(room.typeId)),
    typeId: Number(room.typeId),
    guests: Number(room.guests),
  }));
}

export async function prepareQuote(connection, input) {
  const rooms = await pricedRooms(connection, input.rooms);
  const promotions = await applicablePromotions(connection, {
    ...input,
    roomCount: rooms.length,
  });
  return { rooms, quote: quoteBooking({ ...input, rooms, promotions }) };
}

export async function createBookingHold(
  connection,
  {
    customerId,
    accountId = null,
    rooms,
    checkIn,
    checkOut,
    services = {},
    source = "online",
    now = new Date(),
  },
) {
  nightsBetween(checkIn, checkOut);
  if (
    checkIn <
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now)
  )
    fail(400, "วันเข้าพักต้องไม่อยู่ในอดีต");
  const typeIds = [...new Set((rooms || []).map((r) => Number(r.typeId)))].sort(
    (a, b) => a - b,
  );
  if (!typeIds.length || typeIds.some((id) => !Number.isInteger(id) || id < 1))
    fail(400, "รายการห้องไม่ถูกต้อง");
  await connection.query(
    `SELECT id FROM room_types WHERE id IN (${typeIds.map(() => "?").join(",")}) ORDER BY id FOR UPDATE`,
    typeIds,
  );
  await expireBookingHolds(connection, now);
  const { rooms: priced, quote } = await prepareQuote(connection, {
    rooms,
    checkIn,
    checkOut,
    ...services,
  });
  const availability = await getAvailability(connection, { checkIn, checkOut });
  for (const typeId of typeIds) {
    const requested = priced.filter((room) => room.typeId === typeId).length;
    if (
      (availability.find((type) => Number(type.id) === typeId)?.available ||
        0) < requested
    )
      fail(409, "ห้องประเภทที่เลือกไม่ว่างครบตามวันที่");
  }
  const holdUntil = new Date(now.getTime() + 15 * 60 * 1000);
  const [booking] = await connection.execute(
    "INSERT INTO bookings (customer_id,account_id,source,check_in,check_out,guests,status,hold_until,total,room_subtotal,service_subtotal,deposit_due,price_snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      customerId,
      accountId,
      source,
      checkIn,
      checkOut,
      priced.reduce((sum, room) => sum + room.guests, 0),
      "held",
      holdUntil,
      quote.total,
      quote.roomSubtotal,
      quote.serviceSubtotal,
      quote.depositDue,
      JSON.stringify({ ...quote, rooms: priced }),
    ],
  );
  const bookingId = booking.insertId;
  for (const room of priced) {
    const [inserted] = await connection.execute(
      "INSERT INTO booking_rooms (booking_id,type_id,guests,nightly_price) VALUES (?,?,?,?)",
      [bookingId, room.typeId, room.guests, room.nightlyPrice],
    );
    room.bookingRoomId = inserted.insertId;
  }
  for (const date of quote.breakfastDates)
    for (const room of priced) {
      const [service] = await connection.execute(
        "INSERT INTO booking_services (booking_id,kind,service_date,quantity,unit_price,total) VALUES (?,?,?,?,?,?)",
        [
          bookingId,
          "breakfast",
          date,
          1,
          room.breakfastPrice,
          room.breakfastPrice,
        ],
      );
      await connection.execute(
        "INSERT INTO booking_service_rooms (service_id,booking_room_id) VALUES (?,?)",
        [service.insertId, room.bookingRoomId],
      );
    }
  for (const kind of ["fitness", "sauna"])
    if (quote[kind])
      for (const room of priced) {
        const price = kind === "fitness" ? 500 : 300;
        const [service] = await connection.execute(
          "INSERT INTO booking_services (booking_id,kind,quantity,unit_price,total) VALUES (?,?,?,?,?)",
          [bookingId, kind, 1, price, price],
        );
        await connection.execute(
          "INSERT INTO booking_service_rooms (service_id,booking_room_id) VALUES (?,?)",
          [service.insertId, room.bookingRoomId],
        );
      }
  await setBookingStatus(
    connection,
    bookingId,
    null,
    "held",
    accountId,
    "สร้างการจองและกันห้อง 15 นาที",
  );
  return {
    id: bookingId,
    rooms: priced,
    ...quote,
    holdUntil: holdUntil.toISOString(),
    status: "held",
  };
}

export async function bookingDetail(connection, id) {
  const [[booking]] = await connection.execute(
    "SELECT b.*,c.full_name AS customerName,c.phone FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=?",
    [id],
  );
  if (!booking) fail(404, "ไม่พบการจอง");
  const [rooms] = await connection.execute(
    "SELECT br.id,br.type_id AS typeId,br.guests,br.room_id AS roomId,r.code,t.name AS typeName FROM booking_rooms br JOIN room_types t ON t.id=br.type_id LEFT JOIN rooms r ON r.id=br.room_id WHERE br.booking_id=?",
    [id],
  );
  const [services] = await connection.execute(
    "SELECT s.*, l.booking_room_id FROM booking_services s LEFT JOIN booking_service_rooms l ON l.service_id=s.id WHERE s.booking_id=? ORDER BY s.id",
    [id],
  );
  const [payments] = await connection.execute(
    "SELECT id,amount,method,channel_detail AS channelDetail,status,submitted_at AS submittedAt,reviewed_at AS reviewedAt,rejection_reason AS rejectionReason FROM payments WHERE booking_id=? ORDER BY id",
    [id],
  );
  const [tours] = await connection.execute(
    "SELECT tp.*,ts.tour_date AS tourDate,ts.time_label AS timeLabel FROM tour_participants tp JOIN tour_slots ts ON ts.id=tp.slot_id WHERE tp.booking_id=?",
    [id],
  );
  const [proposals] = await connection.execute(
    "SELECT p.id,p.booking_room_id AS bookingRoomId,p.proposed_room_id AS roomId,r.code,p.status FROM replacement_proposals p JOIN booking_rooms br ON br.id=p.booking_room_id JOIN rooms r ON r.id=p.proposed_room_id WHERE br.booking_id=? ORDER BY p.id DESC",
    [id],
  );
  const paid = payments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return {
    ...booking,
    rooms,
    services,
    payments,
    tours,
    proposals,
    paid,
    balance: Math.max(0, Number(booking.total) - paid),
  };
}

export function bookingRoutes(app) {
  app.post(
    "/api/bookings/quote",
    asyncRoute(async (req, res) => {
      const { rooms, quote } = await prepareQuote(pool, req.body);
      res.json({ rooms, ...quote });
    }),
  );
  app.post(
    "/api/bookings",
    requireRole("member"),
    asyncRoute(async (req, res) => {
      const [[account]] = await pool.execute(
        "SELECT customer_id FROM accounts WHERE id=? AND active=1",
        [req.session.accountId],
      );
      if (!account?.customer_id) fail(403, "บัญชีนี้จองออนไลน์ไม่ได้");
      const result = await withTransaction((connection) =>
        createBookingHold(connection, {
          rooms: req.body.rooms,
          checkIn: req.body.checkIn,
          checkOut: req.body.checkOut,
          services: req.body.services,
          customerId: account.customer_id,
          accountId: req.session.accountId,
          source: "online",
        }),
      );
      res.status(201).json(result);
    }),
  );
  app.get(
    "/api/bookings/mine",
    requireRole("member"),
    asyncRoute(async (req, res) => {
      const [rows] = await pool.execute(
        "SELECT id,check_in AS checkIn,check_out AS checkOut,status,total,deposit_due AS depositDue,hold_until AS holdUntil,created_at AS createdAt FROM bookings WHERE account_id=? ORDER BY id DESC",
        [req.session.accountId],
      );
      res.json(rows);
    }),
  );
  app.get(
    "/api/bookings",
    requireRole("superadmin", "reception", "accounting", "management"),
    asyncRoute(async (req, res) => {
      const [rows] = await pool.query(
        "SELECT b.id,b.check_in AS checkIn,b.check_out AS checkOut,b.status,b.total,b.deposit_due AS depositDue,c.full_name AS customerName FROM bookings b JOIN customers c ON c.id=b.customer_id ORDER BY b.id DESC LIMIT 100",
      );
      res.json(rows);
    }),
  );
  app.get(
    "/api/bookings/:id",
    requireUser,
    asyncRoute(async (req, res) => {
      const detail = await bookingDetail(pool, req.params.id);
      if (
        req.session.role === "member" &&
        Number(detail.account_id) !== Number(req.session.accountId)
      )
        fail(403, "ไม่มีสิทธิ์ดูการจองนี้");
      res.json(detail);
    }),
  );
}
