import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";

import { runtimeConfig } from "../config.js";
import {
  createProofUpload,
  proofResponseHeaders,
  removeUploadedProof
} from "../modules/payments/upload.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("payment storage root defaults outside the public root and accepts an override", () => {
  const base = { AUTH_SECRET: "x".repeat(32) };
  const defaultConfig = runtimeConfig(base);
  assert.equal(defaultConfig.storageRoot, path.join(API_ROOT, "storage"));
  assert.equal(runtimeConfig({ ...base, PAYMENT_STORAGE_ROOT: "/tmp/tkc-proof-test" }).storageRoot, "/tmp/tkc-proof-test");
});

test("proof upload verifies bytes, generates a confined reference, and can be removed", async () => {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tkc-proof-"));
  const fixture = await uploadFixture(storageRoot);
  try {
    const form = new FormData();
    form.append("proof", new Blob([PNG], { type: "image/png" }), "../../unsafe.png");
    const response = await fetch(`${fixture.baseUrl}/upload`, { method: "POST", body: form });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.match(body.reference, /^payments\/[0-9a-f-]+\.png$/);
    assert.equal(path.dirname(body.path), path.join(storageRoot, "payments"));
    assert.deepEqual(await readFile(body.path), PNG);
    assert.deepEqual(proofResponseHeaders(), {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache"
    });

    await removeUploadedProof({ path: body.path });
    await assert.rejects(() => stat(body.path), { code: "ENOENT" });
    await removeUploadedProof({ path: body.path });
  } finally {
    await fixture.close();
  }
});

test("proof upload rejects unsupported MIME, mismatched magic bytes, and files over 5 MiB", async () => {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tkc-proof-invalid-"));
  const fixture = await uploadFixture(storageRoot);
  try {
    for (const [bytes, type, expectedCode] of [
      [Buffer.from("plain text"), "text/plain", "PROOF_TYPE_INVALID"],
      [Buffer.from("not a png"), "image/png", "PROOF_CONTENT_INVALID"]
    ]) {
      const form = new FormData();
      form.append("proof", new Blob([bytes], { type }), "proof.bin");
      const response = await fetch(`${fixture.baseUrl}/upload`, { method: "POST", body: form });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, expectedCode);
    }

    const oversized = new FormData();
    oversized.append(
      "proof",
      new Blob([PNG, Buffer.alloc(5 * 1024 * 1024)], { type: "image/png" }),
      "large.png"
    );
    const response = await fetch(`${fixture.baseUrl}/upload`, { method: "POST", body: oversized });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "PROOF_TOO_LARGE");
  } finally {
    await fixture.close();
  }
});

async function uploadFixture(storageRoot) {
  const app = express();
  app.post("/upload", createProofUpload({ storageRoot }), (request, response) => {
    response.status(201).json({
      reference: request.file.reference,
      path: request.file.path
    });
  });
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({ code: error.code || "INTERNAL_ERROR" });
  });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
