import test from "node:test";
import assert from "node:assert/strict";
import { calculateRefund } from "../server/refunds.js";

test("DOCX cancellation fee and exceptions use amounts already paid", () => {
  assert.deepEqual(
    [0, 2000, 5000].map((paid) =>
      calculateRefund({
        reason: "guest_cancel",
        paid,
        total: 5000,
        checkIn: "2027-12-03",
        now: new Date("2027-12-01T00:00:00Z"),
      }),
    ),
    [0, 1000, 4000],
  );
  assert.equal(
    calculateRefund({
      reason: "guest_cancel",
      paid: 5000,
      total: 5000,
      checkIn: "2027-12-03",
      now: new Date("2027-12-02T08:00:00Z"),
    }),
    0,
  );
  assert.equal(
    calculateRefund({ reason: "hotel_failure", paid: 5000, total: 5000 }),
    5000,
  );
  assert.equal(
    calculateRefund({
      reason: "service_cancel_at_checkin",
      paid: 5000,
      serviceAmount: 500,
    }),
    400,
  );
  assert.equal(
    calculateRefund({ reason: "tour_cancel", paid: 5000, total: 5000 }),
    0,
  );
});
