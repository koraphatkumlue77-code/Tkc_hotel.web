import assert from "node:assert/strict";
import test from "node:test";

import { promotionInput, attractionInput } from "../modules/promotions/contracts.js";

test("promotion and attraction contracts normalize safe catalog input", () => {
  assert.deepEqual(promotionInput({
    code: " save15 ", name: " Summer save ", discountPercent: "15.00",
    priority: 5, validFrom: "2037-01-01T00:00:00Z", validUntil: null, active: true
  }), {
    code: "SAVE15", name: "Summer save", discountPercent: "15.00",
    priority: 5, validFrom: "2037-01-01T00:00:00.000Z", validUntil: null, active: true
  });
  assert.deepEqual(attractionInput({
    name: " Sunset Beach ", description: " Walk from hotel ", season: "all year",
    imageReference: "/images/sunset.jpg", schedule: { opens: "18:00" }, visible: true, active: true
  }), {
    name: "Sunset Beach", description: "Walk from hotel", season: "all year",
    imageReference: "/images/sunset.jpg", schedule: { opens: "18:00" }, visible: true, active: true
  });
});

test("promotion contracts reject invalid percent, period, and unsafe attraction input", () => {
  assert.throws(() => promotionInput({
    code: "BAD CODE", name: "Bad", discountPercent: "0", priority: 0, active: true
  }), (error) => error.status === 400);
  assert.throws(() => promotionInput({
    code: "BAD", name: "Bad", discountPercent: "10", priority: 0,
    validFrom: "2037-02-01T00:00:00Z", validUntil: "2037-01-01T00:00:00Z", active: true
  }), (error) => error.status === 400);
  assert.throws(() => attractionInput({
    name: "Bad", description: "x", schedule: "18:00", visible: true, active: true
  }), (error) => error.status === 400);
});
