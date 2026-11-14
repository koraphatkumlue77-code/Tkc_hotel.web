import test from "node:test";
import assert from "node:assert/strict";
import { canManageRole } from "../server/staff.js";

test("only management may alter management and superadmin rights", () => {
  assert.equal(canManageRole("superadmin", "management"), false);
  assert.equal(canManageRole("superadmin", "reception"), true);
  assert.equal(canManageRole("management", "superadmin"), true);
  assert.equal(canManageRole("reception", "housekeeping"), false);
});
