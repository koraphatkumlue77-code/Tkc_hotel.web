import assert from "node:assert/strict";
import test from "node:test";

import { validateCreateBooking } from "../modules/bookings/contracts.js";
import { centsToDecimal, decimalToCents, percentageOfCents } from "../modules/bookings/money.js";

test("booking contract normalizes a valid customer request", () => {
  const value = validateCreateBooking({
    checkIn: "2037-03-10",
    checkOut: "2037-03-12",
    rooms: [
      { roomTypeId: 1, guestCount: 2 },
      { roomTypeId: 1, guestCount: 1 }
    ],
    breakfastDates: ["2037-03-11", "2037-03-12"],
    promotionCodes: [" save10 ", "VIP5"],
    paymentChoice: "deposit"
  });

  assert.deepEqual(value, {
    checkIn: "2037-03-10",
    checkOut: "2037-03-12",
    nights: 2,
    rooms: [
      { roomTypeId: 1, guestCount: 2 },
      { roomTypeId: 1, guestCount: 1 }
    ],
    breakfastDates: ["2037-03-11", "2037-03-12"],
    promotionCodes: ["SAVE10", "VIP5"],
    paymentChoice: "deposit"
  });
});

test("booking contract rejects malformed dates, rooms, duplicates, and payment choices", () => {
  const base = {
    checkIn: "2037-03-10",
    checkOut: "2037-03-12",
    rooms: [{ roomTypeId: 1, guestCount: 2 }],
    breakfastDates: [],
    promotionCodes: [],
    paymentChoice: "deposit"
  };
  for (const body of [
    { ...base, checkOut: "2037-03-10" },
    { ...base, rooms: [] },
    { ...base, rooms: [{ roomTypeId: "1", guestCount: 2 }] },
    { ...base, breakfastDates: ["2037-03-11", "2037-03-11"] },
    { ...base, breakfastDates: ["2037-03-09"] },
    { ...base, promotionCodes: ["SAVE", "save"] },
    { ...base, paymentChoice: "later" }
  ]) {
    assert.throws(() => validateCreateBooking(body), (error) => error.status === 400);
  }
});

test("money helpers preserve decimal precision without floating point amounts", () => {
  assert.equal(decimalToCents("1000.00"), 100000);
  assert.equal(decimalToCents("350.50"), 35050);
  assert.equal(centsToDecimal(135050), "1350.50");
  assert.equal(percentageOfCents(10005, "12.50"), 1251);
  assert.equal(percentageOfCents(999999999999, "100.00"), 999999999999);
  assert.throws(() => decimalToCents("1e3"), /decimal/);
});
