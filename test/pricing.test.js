import test from "node:test";
import assert from "node:assert/strict";
import { quoteBooking } from "../server/pricing.js";

test("DOCX room, shared-service and deposit examples", () => {
  const standard = {
    typeId: 1,
    nightlyPrice: 1000,
    breakfastPrice: 350,
    capacity: 2,
    guests: 2,
  };
  const family = {
    typeId: 4,
    nightlyPrice: 4500,
    breakfastPrice: 500,
    capacity: 6,
    guests: 4,
  };
  const one = quoteBooking({
    rooms: [standard],
    checkIn: "2026-12-01",
    checkOut: "2026-12-03",
    breakfastDates: ["2026-12-01", "2026-12-02"],
    fitness: true,
  });
  assert.equal(one.total, 3200);
  assert.equal(one.depositDue, 640);
  const two = quoteBooking({
    rooms: [standard, family],
    checkIn: "2026-12-01",
    checkOut: "2026-12-03",
    breakfastDates: ["2026-12-01", "2026-12-02"],
  });
  assert.equal(two.total, 12700);
  assert.equal(two.depositDue, 5080);
  const stacked = quoteBooking({
    rooms: [{ ...standard, nightlyPrice: 5000 }],
    checkIn: "2026-12-01",
    checkOut: "2026-12-02",
    fitness: true,
    promotions: [
      { id: 1, percentOff: 10, priority: 1 },
      { id: 2, percentOff: 20, priority: 2 },
    ],
  });
  assert.equal(stacked.total, 4100);
});
