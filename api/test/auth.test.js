import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

import { apiErrorHandler, requestIdMiddleware } from "../middleware/errors.js";
import { sanitizeAuditData, writeAudit } from "../modules/auth/repository.js";
import { normalizeEmployeeRole } from "../modules/auth/service.js";
import { createSessionTools, requireRoles } from "../modules/auth/session.js";
import { isRoomTransitionAllowed } from "../modules/rooms/policy.js";

const authConfig = {
  secret: "unit-test-secret-that-is-at-least-32-characters",
  tokenTtlSeconds: 900,
  cookieName: "tkc_session",
  secureCookie: false
};

test("employee roles normalize to the five server-side roles", () => {
  assert.equal(normalizeEmployeeRole("RECEPTION"), "reception");
  assert.equal(normalizeEmployeeRole("Front Office"), "reception");
  assert.equal(normalizeEmployeeRole("ACCOUNTANT"), "accounting");
  assert.equal(normalizeEmployeeRole("housekeeper"), "housekeeping");
  assert.equal(normalizeEmployeeRole("SUPER-ADMIN"), "superadmin");
  assert.equal(normalizeEmployeeRole("manager"), "management");
  assert.equal(normalizeEmployeeRole("owner"), null);
});

test("room status policy separates reception, housekeeping, and management duties", () => {
  assert.equal(isRoomTransitionAllowed("reception", "AVAILABLE", "OCCUPIED"), true);
  assert.equal(isRoomTransitionAllowed("reception", "OCCUPIED", "NEEDS_CLEANING"), true);
  assert.equal(isRoomTransitionAllowed("reception", "NEEDS_CLEANING", "AVAILABLE"), false);
  assert.equal(isRoomTransitionAllowed("housekeeping", "NEEDS_CLEANING", "AVAILABLE"), true);
  assert.equal(isRoomTransitionAllowed("housekeeping", "AVAILABLE", "OCCUPIED"), false);
  assert.equal(isRoomTransitionAllowed("management", "AVAILABLE", "OUT_OF_SERVICE"), true);
  assert.equal(isRoomTransitionAllowed("management", "OUT_OF_SERVICE", "AVAILABLE"), true);
  assert.equal(isRoomTransitionAllowed("management", "AVAILABLE", "OCCUPIED"), false);
});

test("audit data recursively removes authentication secrets", () => {
  assert.deepEqual(
    sanitizeAuditData({ email: "safe@example.test", password: "bad", nested: { token: "bad", ok: 1 } }),
    { email: "safe@example.test", nested: { ok: 1 } }
  );
  assert.deepEqual(sanitizeAuditData(new Error("database password leaked")), {});
  assert.deepEqual(
    sanitizeAuditData({ message: "SQL failed", sql: "SELECT secret", errno: 123, safe: "ok" }),
    { safe: "ok" }
  );
});

test("audit helper supports a system actor without principal IDs", async () => {
  let parameters;
  await writeAudit({
    execute: async (_sql, values) => {
      parameters = values;
    }
  }, {
    entityType: "Room",
    entityId: 1,
    action: "SYNC",
    after: { safe: true }
  });
  assert.equal(parameters[3], "SYSTEM");
  assert.equal(parameters[4], null);
  assert.equal(parameters[5], null);
});

test("role middleware allows only configured server-side roles", async () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/allowed", (request, _response, next) => {
    request.principal = { role: "reception" };
    next();
  }, requireRoles("reception"), (_request, response) => response.json({ ok: true }));
  app.get("/denied", (request, _response, next) => {
    request.principal = { role: "customer" };
    next();
  }, requireRoles("reception"), (_request, response) => response.json({ ok: true }));
  app.use(apiErrorHandler);

  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/allowed`)).status, 200);
    const denied = await fetch(`${baseUrl}/denied`);
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, "ROLE_FORBIDDEN");
  });
});

test("session middleware rejects tampered and expired tokens", async () => {
  const session = createSessionTools(authConfig, {
    loadPrincipal: async () => ({ id: 1, type: "customer", role: "customer" })
  });
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/me", session.authenticate, (request, response) => {
    response.json({ principal: request.principal });
  });
  app.use(apiErrorHandler);

  const claims = {
    algorithm: "HS256",
    subject: "1",
    issuer: "tkc-hotel-api",
    audience: "tkc-hotel-web"
  };
  const expired = jwt.sign({ type: "customer" }, authConfig.secret, {
    ...claims,
    expiresIn: -1
  });
  const valid = jwt.sign({ type: "customer" }, authConfig.secret, {
    ...claims,
    expiresIn: 60
  });

  await withServer(app, async (baseUrl) => {
    for (const token of [expired, `${valid.slice(0, -1)}x`]) {
      const response = await fetch(`${baseUrl}/me`, {
        headers: { Cookie: `tkc_session=${token}` }
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, "SESSION_INVALID");
    }
  });
});

test("session middleware preserves database outages as internal errors", async () => {
  const session = createSessionTools(authConfig, {
    loadPrincipal: async () => {
      throw new Error("database unavailable with password=hidden");
    }
  });
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/me", session.authenticate, (_request, response) => response.json({ ok: true }));
  app.use(apiErrorHandler);
  const token = jwt.sign({ type: "customer" }, authConfig.secret, {
    algorithm: "HS256",
    subject: "1",
    issuer: "tkc-hotel-api",
    audience: "tkc-hotel-web",
    expiresIn: 60
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/me`, {
      headers: { Cookie: `tkc_session=${token}` }
    });
    const text = await response.text();
    assert.equal(response.status, 500);
    assert.doesNotMatch(text, /database unavailable|password=hidden/);
  });
});

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
