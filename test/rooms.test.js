import test from "node:test";
import assert from "node:assert/strict";
import { overlaps } from "../server/rooms.js";
import { nightsBetween } from "../server/pricing.js";

test("adjacent stays do not overlap and invalid dates are rejected", () => {
  assert.equal(
    overlaps("2026-12-01", "2026-12-03", "2026-12-03", "2026-12-05"),
    false,
  );
  assert.equal(
    overlaps("2026-12-01", "2026-12-03", "2026-12-02", "2026-12-05"),
    true,
  );
  assert.throws(() => nightsBetween("2026-02-30", "2026-03-03"));
});
