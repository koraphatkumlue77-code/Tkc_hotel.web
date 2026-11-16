import assert from "node:assert/strict";
import test from "node:test";

import {
  configFromEnvironment,
  validateResetResult,
  validateTestDatabase
} from "../scripts/reset-test-db.js";

test("test reset rejects missing database configuration", () => {
  assert.throws(
    () => configFromEnvironment({}),
    /Missing test database configuration/
  );
});

test("test reset rejects a database name without the _test suffix", () => {
  assert.throws(() => validateTestDatabase("tkc_hotel_dev"), /must end with _test/);
  assert.throws(() => validateTestDatabase("production"), /must end with _test/);
});

test("test reset accepts only a clearly isolated test database", () => {
  assert.doesNotThrow(() => validateTestDatabase("tkc_hotel_test"));
});

test("test reset fails unless the canonical seed inventory is complete", () => {
  assert.doesNotThrow(() => validateResetResult({
    tables: 19,
    roomTypes: 4,
    rooms: 800,
    services: 5
  }));
  assert.throws(
    () => validateResetResult({ tables: 18, roomTypes: 4, rooms: 800, services: 5 }),
    /Unexpected test database inventory/
  );
});

