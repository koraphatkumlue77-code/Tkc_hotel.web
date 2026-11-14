import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.js";
import { seed } from "../db/seed.js";
import { financialReport } from "../server/reports.js";
import { resetTestDatabase } from "./reset.js";

test("financial report reads approved simulated payments from MySQL", async () => {
  await resetTestDatabase();
  await seed();
  try {
    const [[row]] = await pool.query(
      "SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE status='approved'",
    );
    const report = await financialReport(pool);
    assert.equal(report.received, Number(row.amount));
  } finally {
    await pool.end();
  }
});
