import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAssignment,
  validateEmergencyMove,
  validateDecision
} from "../modules/stays/contracts.js";

test("stay contracts normalize assignment and emergency-move bodies", () => {
  assert.deepEqual(validateAssignment({ bookingRoomId: 12, roomId: 34, reason: " Near lift " }), {
    bookingRoomId: 12,
    roomId: 34,
    reason: "Near lift"
  });
  assert.deepEqual(validateEmergencyMove({ bookingRoomId: 12, roomId: 35, reason: "Air conditioner failed" }), {
    bookingRoomId: 12,
    roomId: 35,
    reason: "Air conditioner failed"
  });
  assert.deepEqual(validateDecision({ reason: "  Approved by duty manager  " }), {
    reason: "Approved by duty manager"
  });
});

test("stay contracts reject invalid identifiers and reasons", () => {
  for (const value of [
    {},
    { bookingRoomId: "1", roomId: 2 },
    { bookingRoomId: 1, roomId: 0 },
    { bookingRoomId: 1, roomId: 2, reason: "x".repeat(251) }
  ]) {
    assert.throws(() => validateAssignment(value), (error) => error.status === 400);
  }
  assert.throws(
    () => validateEmergencyMove({ bookingRoomId: 1, roomId: 2, reason: " " }),
    (error) => error.status === 400
  );
  assert.throws(() => validateDecision({ reason: 7 }), (error) => error.status === 400);
});
