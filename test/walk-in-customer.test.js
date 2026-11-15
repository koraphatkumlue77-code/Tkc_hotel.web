import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
import { seed } from "../db/seed.js";
import { resetTestDatabase } from "./reset.js";

test("reception can reuse an existing customer or create a new walk-in customer", async () => {
  await resetTestDatabase();
  await seed();
  const [customer] = await pool.execute(
    "INSERT INTO customers (full_name,phone,identity_reference) VALUES (?,?,?)",
    ["Repeat Guest", "0811234567", "PASSPORT1234"],
  );
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (role) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `${role}@tkc.local`,
        password: process.env.DEMO_STAFF_PASSWORD || "TkcDemo2026!",
      }),
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  try {
    const reception = await login("reception");
    const accounting = await login("accounting");
    assert.equal(
      (
        await fetch(`${base}/api/walk-in-customers?q=Repeat`, {
          headers: { cookie: accounting },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/walk-in-customers?q=Re`, {
          headers: { cookie: reception },
        })
      ).status,
      400,
    );
    const response = await fetch(`${base}/api/walk-in-customers?q=Repeat`, {
      headers: { cookie: reception },
    });
    const matches = await response.json();
    assert.deepEqual(matches, [
      {
        id: customer.insertId,
        fullName: "Repeat Guest",
        phoneLast4: "4567",
        identityLast4: "1234",
      },
    ]);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const checkIn = new Date(Date.now() + 20 * 86400000)
      .toISOString()
      .slice(0, 10);
    const checkOut = new Date(Date.now() + 22 * 86400000)
      .toISOString()
      .slice(0, 10);
    const create = (body) =>
      fetch(`${base}/api/walk-ins`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: reception },
        body: JSON.stringify({
          checkIn,
          checkOut,
          rooms: [{ typeId: 1, guests: 2 }],
          ...body,
        }),
      });
    assert.equal((await create({ customerId: 999999999 })).status, 404);
    const existingResponse = await create({ customerId: customer.insertId });
    assert.equal(existingResponse.status, 201);
    const existing = await existingResponse.json();
    assert.equal(existing.status, "confirmed");
    const [[saved]] = await pool.execute(
      "SELECT customer_id, source FROM bookings WHERE id=?",
      [existing.id],
    );
    assert.equal(saved.customer_id, customer.insertId);
    assert.equal(saved.source, "walk_in");
    const newResponse = await create({
      fullName: "New Guest",
      phone: "0800000000",
      identityReference: "NEW-1234",
    });
    assert.equal(newResponse.status, 201);
    const [[count]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM customers WHERE full_name='Repeat Guest'",
    );
    assert.equal(count.n, 1);
    const [[newCount]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM customers WHERE full_name='New Guest'",
    );
    assert.equal(newCount.n, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
