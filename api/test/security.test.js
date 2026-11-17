import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { runtimeConfig } from "../config.js";
import {
  ApiError,
  apiErrorHandler,
  requestIdMiddleware
} from "../middleware/errors.js";
import { requireSameOrigin } from "../middleware/origin.js";
import {
  normalizeEmail,
  requireEmail,
  requireString
} from "../middleware/validation.js";

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("runtimeConfig requires a strong authentication secret", () => {
  assert.throws(() => runtimeConfig({ PORT: "3000" }), /AUTH_SECRET/);
  assert.throws(
    () => runtimeConfig({ PORT: "3000", AUTH_SECRET: "too-short" }),
    /at least 32/
  );

  const config = runtimeConfig({
    PORT: "3001",
    AUTH_SECRET: "x".repeat(32),
    AUTH_TOKEN_TTL_SECONDS: "900"
  });

  assert.equal(config.port, 3001);
  assert.equal(config.auth.tokenTtlSeconds, 900);
  assert.equal(config.auth.cookieName, "tkc_session");
  assert.throws(
    () => runtimeConfig({ AUTH_SECRET: "x".repeat(32), AUTH_COOKIE_SECURE: "yes" }),
    /AUTH_COOKIE_SECURE/
  );
});

test("validation helpers normalize values and reject unsafe input", () => {
  assert.equal(normalizeEmail("  GUEST@Example.COM "), "guest@example.com");
  assert.equal(requireEmail("email", "guest@example.com"), "guest@example.com");
  assert.equal(requireString("name", "  Guest  ", { max: 20 }), "Guest");
  assert.throws(() => requireEmail("email", "not-an-email"), ApiError);
  assert.throws(
    () => requireString("name", "", { max: 20 }),
    (error) => error.status === 400 && error.code === "VALIDATION_ERROR"
  );
});

test("same-origin middleware rejects a mismatched browser Origin", async () => {
  const app = express();
  app.use(express.json());
  app.use(requireSameOrigin);
  app.post("/api/protected", (_request, response) => response.json({ ok: true }));
  app.use(apiErrorHandler);

  await withServer(app, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/protected`, {
      method: "POST",
      headers: { Origin: baseUrl }
    });
    assert.equal(allowed.status, 200);

    const schemeMismatch = await fetch(`${baseUrl}/api/protected`, {
      method: "POST",
      headers: { Origin: baseUrl.replace("http://", "https://") }
    });
    assert.equal(schemeMismatch.status, 403);

    const rejected = await fetch(`${baseUrl}/api/protected`, {
      method: "POST",
      headers: { Origin: "https://attacker.example" }
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).code, "ORIGIN_NOT_ALLOWED");
  });
});

test("API errors include a request ID and never expose internal details", async () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/expected", () => {
    throw new ApiError(409, "EMAIL_IN_USE", "Email is already registered");
  });
  app.get("/unexpected", () => {
    throw new Error("password=super-secret database failure");
  });
  app.use(apiErrorHandler);

  await withServer(app, async (baseUrl) => {
    const expected = await fetch(`${baseUrl}/expected`);
    const expectedBody = await expected.json();
    assert.equal(expected.status, 409);
    assert.equal(expectedBody.code, "EMAIL_IN_USE");
    assert.equal(expectedBody.requestId, expected.headers.get("x-request-id"));

    const unexpected = await fetch(`${baseUrl}/unexpected`);
    const unexpectedText = await unexpected.text();
    assert.equal(unexpected.status, 500);
    assert.match(unexpectedText, /INTERNAL_ERROR/);
    assert.doesNotMatch(unexpectedText, /super-secret|database failure/);
  });
});

test("malformed JSON is a safe 400 response", async () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.post("/api/input", (_request, response) => response.json({ ok: true }));
  app.use(apiErrorHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json"
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_JSON");
    assert.doesNotMatch(JSON.stringify(body), /not-json|SyntaxError/);
  });
});
