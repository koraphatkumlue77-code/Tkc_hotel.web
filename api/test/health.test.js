import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../app.js";

async function request(app, path) {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const address = server.address();
    return await fetch(`http://127.0.0.1:${address.port}${path}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("GET /api/health reports that the API is alive", async () => {
  const app = createApp({
    checkDatabase: async () => {
      throw new Error("liveness must not access the database");
    }
  });

  const response = await request(app, "/api/health");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "tkc-hotel-api"
  });
});

test("GET /api/health/db reports a connected database", async () => {
  const app = createApp({ checkDatabase: async () => {} });

  const response = await request(app, "/api/health/db");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    database: "connected"
  });
});

test("GET /api/health/db hides database connection errors", async () => {
  const app = createApp({
    checkDatabase: async () => {
      const error = new Error("Access denied for password=secret");
      error.code = "ER_ACCESS_DENIED_ERROR";
      throw error;
    }
  });

  const response = await request(app, "/api/health/db");

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: "error",
    database: "unavailable"
  });
});

test("unknown API routes return 404", async () => {
  const app = createApp({ checkDatabase: async () => {} });

  const response = await request(app, "/api/not-found");

  assert.equal(response.status, 404);
});
