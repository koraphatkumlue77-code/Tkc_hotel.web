import assert from "node:assert/strict";
import test from "node:test";

import {
  detectCompletedMigration,
  PREFLIGHT_CHECKS,
  runPreflight,
  summarizePreflight
} from "../scripts/preflight-plan-b.js";

test("preflight CLI can recognize a fully migrated schema before legacy checks", async () => {
  const pool = { query: async () => [[{ complete: 1 }]] };
  assert.equal(await detectCompletedMigration(pool), true);
});

function createPool(counts = {}) {
  return {
    async query(sql) {
      const key = /preflight:([a-z0-9_-]+)/.exec(sql)?.[1];
      assert.ok(key, `query is missing a preflight marker: ${sql}`);
      return [[{ blocking_count: counts[key] ?? 0 }]];
    }
  };
}

test("clean legacy schema passes every blocking Plan B preflight check", async () => {
  const result = await runPreflight(createPool());

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, PREFLIGHT_CHECKS.length);
  assert.equal(result.blockingCount, 0);
});

test("preflight reports duplicate email and invalid legacy values", async () => {
  const result = await runPreflight(createPool({
    "duplicate-customer-email": 2,
    "invalid-booking-values": 3,
    "invalid-payment-amount": 1,
    "invalid-room-type-values": 1,
    "invalid-tour-capacity": 2
  }));

  assert.equal(result.ok, false);
  assert.equal(result.blockingCount, 9);
  assert.deepEqual(
    result.checks.filter((check) => check.count > 0).map((check) => check.key),
    [
      "duplicate-customer-email",
      "invalid-booking-values",
      "invalid-payment-amount",
      "invalid-room-type-values",
      "invalid-tour-capacity"
    ]
  );
});

test("preflight blocks a partially applied Plan B migration", async () => {
  const result = await runPreflight(createPool({
    "existing-plan-b-tables": 2,
    "existing-plan-b-columns": 4
  }));

  assert.equal(result.ok, false);
  assert.equal(result.blockingCount, 6);
  assert.match(summarizePreflight(result), /existing-plan-b-tables: 2/);
  assert.match(summarizePreflight(result), /existing-plan-b-columns: 4/);
});

test("preflight accepts the verified B-01/B-02 prefix when resuming at B-03", async () => {
  const result = await runPreflight(
    createPool({ "existing-plan-b-columns": 2 }),
    { resumeAfter: 2 }
  );

  assert.equal(result.ok, true);
  assert.equal(result.resumeAfter, 2);
  assert.equal(result.checks.find((item) => item.key === "existing-plan-b-columns").count, 0);
});

test("resume after B-02 blocks an incomplete B-01/B-02 contract", async () => {
  const result = await runPreflight(
    createPool({
      "existing-plan-b-columns": 2,
      "resume-contract-columns": 1
    }),
    { resumeAfter: 2 }
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((item) => item.key === "resume-contract-columns").count,
    1
  );
});

