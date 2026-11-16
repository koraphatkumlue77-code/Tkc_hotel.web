import assert from "node:assert/strict";
import test from "node:test";

import { serviceSelection, staffServiceSelection } from "../modules/services/contracts.js";

test("service contracts normalize customer and post-Check-in selections", () => {
  assert.deepEqual(serviceSelection({
    serviceId: 3, bookingRoomId: 8, quantity: 2, usageDate: "2037-04-10"
  }), { serviceId: 3, bookingRoomId: 8, quantity: 2, usageDate: "2037-04-10" });
  assert.deepEqual(staffServiceSelection({
    serviceId: 4,
    bookingRoomId: 8,
    quantity: 1,
    usageDate: null,
    method: " cash ",
    idempotencyKey: " svc-001 "
  }), {
    serviceId: 4,
    bookingRoomId: 8,
    quantity: 1,
    usageDate: null,
    method: "CASH",
    idempotencyKey: "SVC-001"
  });
});

test("service contracts reject invalid IDs, dates, quantities, methods, and keys", () => {
  for (const body of [
    { serviceId: "3", bookingRoomId: 8, quantity: 1 },
    { serviceId: 3, bookingRoomId: 0, quantity: 1 },
    { serviceId: 3, bookingRoomId: 8, quantity: 0 },
    { serviceId: 3, bookingRoomId: 8, quantity: 1, usageDate: "2037-02-30" }
  ]) assert.throws(() => serviceSelection(body), (error) => error.status === 400);
  assert.throws(() => staffServiceSelection({
    serviceId: 3, bookingRoomId: 8, quantity: 1, method: "crypto", idempotencyKey: "bad key"
  }), (error) => error.status === 400);
});
