import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.js";
import { migrate } from "../db/migrate.js";
import { seed } from "../db/seed.js";
import { createApp } from "../server/app.js";
import { resetTestDatabase } from "./reset.js";

test("health and repeatable hotel seed", async () => {
  await resetTestDatabase();
  await migrate();
  await seed();
  await migrate();
  await seed();
  const server = createApp().listen(0);
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/health`,
    );
    assert.equal(response.status, 200);
    const [rows] = await pool.query(
      "SELECT type_id, COUNT(*) AS amount FROM rooms GROUP BY type_id ORDER BY type_id",
    );
    assert.deepEqual(
      rows.map((row) => row.amount),
      [300, 150, 250, 100],
    );
  } finally {
    server.close();
    await pool.end();
  }
});
