import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { migrate } from "../db/migrate.js";
import { pool } from "../server/db.js";
import { resetTestDatabase } from "./reset.js";

test("member registration uses a hash and staff routes enforce roles", async () => {
  await resetTestDatabase();
  await migrate();
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const email = `member-${Date.now()}@example.test`;
    const body = {
      email,
      password: "Passphrase-123!",
      fullName: "<script>alert(1)</script>",
      phone: "0812345678",
      identityReference: "TEST-001",
    };
    const response = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const [rows] = await pool.execute(
      "SELECT password_hash FROM accounts WHERE email = ?",
      [email],
    );
    assert.notEqual(rows[0].password_hash, body.password);
    assert.equal(
      (
        await fetch(`${base}/api/me`, { headers: { cookie } }).then((x) =>
          x.json(),
        )
      ).fullName,
      body.fullName,
    );
    assert.equal((await fetch(`${base}/api/me`)).status, 401);
    assert.equal(
      (await fetch(`${base}/api/staff`, { headers: { cookie } })).status,
      403,
    );
  } finally {
    server.close();
    await pool.end();
  }
});
