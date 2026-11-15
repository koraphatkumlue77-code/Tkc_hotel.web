export function reservationSummary(bookings, now = new Date()) {
  const result = { rooms: {}, fitness: false, sauna: false, tours: 0 };
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
  }).format(now);
  for (const booking of bookings) {
    if (
      ![
        "held",
        "pending_review",
        "confirmed",
        "checked_in",
        "replacement_pending",
      ].includes(booking.status)
    )
      continue;
    if ((booking.check_out || booking.checkOut) < date) continue;
    if (
      booking.status === "held" &&
      booking.hold_until &&
      new Date(booking.hold_until) < now
    )
      continue;
    for (const room of booking.rooms || [])
      result.rooms[room.typeId] = (result.rooms[room.typeId] || 0) + 1;
    for (const service of booking.services || []) {
      if (
        service.status !== "cancelled" &&
        ["fitness", "sauna"].includes(service.kind)
      )
        result[service.kind] = true;
    }
    result.tours += (booking.tours || []).filter(
      (tour) => tour.status !== "cancelled",
    ).length;
  }
  return result;
}

export function roomImage(room) {
  const type = room.name?.toLowerCase().split(" ")[0] || "standard";
  const defaults = ["standard", "superior", "deluxe", "family"];
  const legacy = ["/assets/room-standard.jpg", "/assets/room-family.jpg"];
  if (
    room.imageUrl &&
    !legacy.includes(room.imageUrl) &&
    localAsset(room.imageUrl, null)
  )
    return room.imageUrl;
  return `/assets/room-${defaults.includes(type) ? type : "standard"}.jpg`;
}

export function accountReturnPath(path) {
  return typeof path === "string" &&
    /^\/account\.html(?:[?#]|$)/.test(path) &&
    !path.includes("\\")
    ? path
    : null;
}

export function localAsset(path, fallback) {
  return typeof path === "string" &&
    /^\/assets\/[\w./-]+\.(?:jpe?g|png|webp|avif|svg)$/i.test(path) &&
    !path.includes("..")
    ? path
    : fallback;
}
