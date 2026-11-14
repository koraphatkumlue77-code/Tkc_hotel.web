import test from "node:test";
import assert from "node:assert/strict";
import { validImageSignature } from "../server/uploads.js";

test("uploaded evidence must be a real supported image", () => {
  assert.equal(
    validImageSignature(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    true,
  );
  assert.equal(
    validImageSignature(Buffer.from("<script>alert(1)</script>")),
    false,
  );
});
