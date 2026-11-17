// SQL รวม KPI จาก Room, Booking, BookingRoom, ServiceUsage, TourReservation และ Payment
export class DashboardRepository {
  constructor(pool) { this.pool = pool; }

  async summary() {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const monthStart = `${today.slice(0, 7)}-01`;
    const [roomRows, bookingRows, serviceRows, serviceBreakdownRows, tourRows, tourBreakdownRows, revenueRows] = await Promise.all([
      this.pool.execute(`
        SELECT COUNT(*) AS totalRooms,
               COALESCE(SUM(current_status = 'OUT_OF_SERVICE'), 0) AS outOfServiceRooms
        FROM Room
      `),
      this.pool.execute(`
        SELECT COUNT(*) AS occupiedOrReservedRooms,
               COALESCE(SUM(b.check_in_date = ? AND b.status = 'CHECKED_IN'), 0) AS checkedInToday,
               COALESCE(SUM(b.check_in_date = ? AND b.status IN ('CONFIRMED', 'LATE_ARRIVAL')), 0) AS arrivalsDueToday
        FROM BookingRoom br
        JOIN Booking b ON b.booking_id = br.booking_id
        WHERE b.check_in_date <= ? AND b.check_out_date > ?
          AND (b.status IN ('PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN')
            OR (b.status = 'PENDING_PAYMENT' AND b.hold_expires_at > CURRENT_TIMESTAMP))
      `, [today, today, today, today]),
      this.pool.execute(`
        SELECT COUNT(DISTINCT bs.booking_service_id) AS servicesToday
        FROM ServiceUsage su
        JOIN BookingService bs ON bs.booking_service_id = su.booking_service_id
        WHERE su.usage_date = ? AND su.status = 'ACTIVE'
      `, [today]),
      this.pool.execute(`
        SELECT s.name, COUNT(DISTINCT bs.booking_service_id) AS bookingCount
        FROM ServiceUsage su
        JOIN BookingService bs ON bs.booking_service_id = su.booking_service_id
        JOIN Service s ON s.service_id = bs.service_id
        WHERE su.usage_date = ? AND su.status = 'ACTIVE'
        GROUP BY s.service_id, s.name
        ORDER BY s.name
      `, [today]),
      this.pool.execute(`
        SELECT COUNT(*) AS toursToday
        FROM TourReservation tr
        JOIN TourRound round_data ON round_data.tour_round_id = tr.tour_round_id
        WHERE round_data.tour_date = ? AND tr.status <> 'CANCELLED'
      `, [today]),
      this.pool.execute(`
        SELECT s.name, COUNT(*) AS bookingCount
        FROM TourReservation tr
        JOIN TourRound round_data ON round_data.tour_round_id = tr.tour_round_id
        JOIN Service s ON s.service_id = round_data.service_id
        WHERE round_data.tour_date = ? AND tr.status <> 'CANCELLED'
        GROUP BY s.service_id, s.name
        ORDER BY s.name
      `, [today]),
      this.pool.execute(`
        SELECT CAST(COALESCE(SUM(CASE
          WHEN direction = 'IN' THEN amount
          WHEN direction = 'OUT' AND transaction_type = 'REFUND_PAYOUT' THEN -amount
          ELSE 0 END), 0) AS CHAR) AS revenue
        FROM Payment
        WHERE ((direction = 'IN' AND status IN ('VERIFIED', 'APPROVED', 'COMPLETED'))
          OR (direction = 'OUT' AND transaction_type = 'REFUND_PAYOUT' AND status = 'COMPLETED'))
          AND CASE WHEN direction = 'IN' THEN COALESCE(verified_at, processed_at, submitted_at)
                   ELSE processed_at END >= ?
          AND CASE WHEN direction = 'IN' THEN COALESCE(verified_at, processed_at, submitted_at)
                   ELSE processed_at END < DATE_ADD(?, INTERVAL 1 DAY)
      `, [monthStart, today])
    ]);
    const rooms = roomRows[0][0];
    const bookings = bookingRows[0][0];
    const totalRooms = Number(rooms.totalRooms);
    const operationalRooms = Math.max(0, totalRooms - Number(rooms.outOfServiceRooms));
    const servicesToday = Number(serviceRows[0][0].servicesToday);
    const toursToday = Number(tourRows[0][0].toursToday);
    return {
      occupancyPercent: operationalRooms
        ? Math.min(100, Math.round(Number(bookings.occupiedOrReservedRooms) * 100 / operationalRooms))
        : 0,
      checkedInRooms: Number(bookings.checkedInToday),
      arrivalsDueRooms: Number(bookings.arrivalsDueToday),
      activitiesToday: servicesToday + toursToday,
      servicesToday,
      toursToday,
      serviceBreakdown: serviceBreakdownRows[0].map((row) => ({ name: row.name, bookingCount: Number(row.bookingCount) })),
      tourBreakdown: tourBreakdownRows[0].map((row) => ({ name: row.name, bookingCount: Number(row.bookingCount) })),
      monthlyNetRevenue: revenueRows[0][0].revenue,
      totalRooms,
      outOfServiceRooms: Number(rooms.outOfServiceRooms),
      asOfDate: today
    };
  }
}
