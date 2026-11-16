import assert from "node:assert/strict";
import test from "node:test";
import { closureInput, damageInput, decisionReason } from "../modules/room-operations/contracts.js";

test("room-operation contracts normalize multipart damage and effective closure data", () => {
  assert.deepEqual(damageInput({ expectedVersion: "3", item: " Mirror ", description: " Cracked corner " }),
    { expectedVersion: 3, item: "Mirror", description: "Cracked corner" });
  assert.deepEqual(closureInput({ expectedVersion: 4, reason: " Repair ", effectiveFrom: null, effectiveTo: "2037-05-02T00:00:00Z" }),
    { expectedVersion: 4, reason: "Repair", effectiveFrom: null, effectiveTo: "2037-05-02T00:00:00.000Z" });
  assert.deepEqual(decisionReason({ reason: " Inspected " }), { reason: "Inspected" });
});

test("room-operation contracts reject invalid versions, text, and periods", () => {
  assert.throws(() => damageInput({ expectedVersion: "x", item: "Mirror", description: "Crack" }), (error) => error.status === 400);
  assert.throws(() => closureInput({ expectedVersion: 1, reason: "Repair", effectiveFrom: "2037-05-02T00:00:00Z", effectiveTo: "2037-05-01T00:00:00Z" }), (error) => error.status === 400);
  assert.throws(() => decisionReason({ reason: " " }), (error) => error.status === 400);
});
