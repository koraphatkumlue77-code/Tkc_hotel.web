import { fail } from "./errors.js";

export function nightsBetween(checkIn, checkOut) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(checkIn || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || "")
  )
    fail(400, "รูปแบบวันที่ไม่ถูกต้อง");
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    new Date(start).toISOString().slice(0, 10) !== checkIn ||
    new Date(end).toISOString().slice(0, 10) !== checkOut ||
    end <= start
  )
    fail(400, "วันออกต้องอยู่หลังวันเข้า");
  return (end - start) / 86400000;
}

export function priceServices({
  rooms,
  breakfastDates = [],
  fitness = false,
  sauna = false,
  tourCharges = [],
}) {
  return (
    rooms.reduce(
      (sum, room) =>
        sum +
        breakfastDates.length * Number(room.breakfastPrice) +
        (fitness ? 500 : 0) +
        (sauna ? 300 : 0),
      0,
    ) + tourCharges.reduce((a, b) => a + Number(b), 0)
  );
}

export function quoteBooking({
  rooms,
  checkIn,
  checkOut,
  breakfastDates = [],
  fitness = false,
  sauna = false,
  tourCharges = [],
  promotions = [],
}) {
  const nights = nightsBetween(checkIn, checkOut);
  if (!Array.isArray(rooms) || !rooms.length || rooms.length > 20)
    fail(400, "เลือกห้อง 1 ถึง 20 ห้อง");
  for (const room of rooms) {
    if (
      !Number.isInteger(Number(room.guests)) ||
      Number(room.guests) < 1 ||
      Number(room.guests) > Number(room.capacity)
    )
      fail(400, "จำนวนผู้เข้าพักเกินความจุห้อง");
    if (
      !Number.isInteger(Number(room.nightlyPrice)) ||
      Number(room.nightlyPrice) < 0
    )
      fail(400, "ราคาห้องไม่ถูกต้อง");
  }
  if (
    !Array.isArray(breakfastDates) ||
    new Set(breakfastDates).size !== breakfastDates.length ||
    breakfastDates.some((date) => date < checkIn || date >= checkOut)
  )
    fail(400, "วันอาหารเช้าต้องอยู่ในช่วงเข้าพัก");
  const roomSubtotal = rooms.reduce(
    (sum, room) => sum + Number(room.nightlyPrice) * nights,
    0,
  );
  let discountedRooms = roomSubtotal;
  const discounts = [];
  for (const promo of [...promotions].sort(
    (a, b) =>
      Number(a.priority) - Number(b.priority) || Number(a.id) - Number(b.id),
  )) {
    const percent = Number(promo.percentOff ?? promo.percent_off);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      fail(400, "โปรโมชั่นไม่ถูกต้อง");
    const amount = Math.min(
      discountedRooms,
      Math.round((discountedRooms * percent) / 100),
    );
    discountedRooms -= amount;
    discounts.push({
      promotionId: promo.id,
      name: promo.name,
      percent,
      amount,
    });
  }
  const serviceSubtotal = priceServices({
    rooms,
    breakfastDates,
    fitness,
    sauna,
    tourCharges,
  });
  const total = discountedRooms + serviceSubtotal;
  const depositDue = Math.round(total * (rooms.length === 1 ? 0.2 : 0.4));
  return {
    nights,
    roomSubtotal,
    discounts,
    discountedRooms,
    serviceSubtotal,
    total,
    depositDue,
    breakfastDates,
    fitness,
    sauna,
    tourCharges,
  };
}
