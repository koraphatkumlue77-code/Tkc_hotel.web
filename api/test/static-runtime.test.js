import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.js";

const publicRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

async function request(app, requestPath) {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}${requestPath}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function app() {
  return createApp({ checkDatabase: async () => {}, publicRoot });
}

test("GET / serves index.html as the landing page", async () => {
  const response = await request(app(), "/");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(await response.text(), /<title>TKC \| Never Wekes Hotel<\/title>/);
});

test("GET /style.css and /script.js serve the frontend assets", async () => {
  const cssResponse = await request(app(), "/style.css");
  const scriptResponse = await request(app(), "/script.js");

  assert.equal(cssResponse.status, 200);
  assert.match(cssResponse.headers.get("content-type"), /text\/css/);
  assert.match(cssResponse.headers.get("cache-control"), /no-store/);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type"), /javascript/);
  assert.match(scriptResponse.headers.get("cache-control"), /no-store/);
});

test("runtime never exposes configuration, database, storage, or dotfiles", async () => {
  for (const requestPath of [
    "/.gitignore",
    "/api/.env",
    "/api/storage/example.txt",
    "/database/schema.sql"
  ]) {
    const response = await request(app(), requestPath);
    assert.equal(response.status, 404, requestPath);
  }
});

test("unknown API routes return a JSON 404", async () => {
  const response = await request(app(), "/api/missing");

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), {
    status: "error",
    code: "API_NOT_FOUND"
  });
});

test("frontend does not ship in-memory demo business records", async () => {
  const scriptResponse = await request(app(), "/script.js");
  const htmlResponse = await request(app(), "/");
  const script = await scriptResponse.text();
  const html = await htmlResponse.text();

  for (const forbidden of [
    "const demoStaff =", "const staffAccounts =", "const staffRooms =",
    "const damageReports =", "getBookingRecordDetail", "startCustomerDemo",
    "refreshStaffDemo"
  ]) assert.doesNotMatch(script, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /บัญชีทดลอง|โหมดจำลอง|ตัวอย่างรหัสห้องและสถานะสำหรับทดลอง/);
});

test("frontend exposes database-backed stay operations", async () => {
  const response = await request(app(), "/script.js");
  const script = await response.text();

  assert.match(script, /\/assignments/);
  assert.match(script, /\/check-in/);
  assert.match(script, /\/no-show/);
  assert.match(script, /\/check-out/);
});

