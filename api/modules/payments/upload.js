import crypto from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import multer from "multer";

import { ApiError } from "../../middleware/errors.js";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

export function createProofUpload({ storageRoot, required = true }) {
  const receive = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PROOF_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!MIME_EXTENSIONS.has(file.mimetype)) {
        callback(new ApiError(400, "PROOF_TYPE_INVALID", "Proof must be a JPEG, PNG, or WebP image"));
        return;
      }
      callback(null, true);
    }
  }).single("proof");

  return (request, response, next) => {
    receive(request, response, async (error) => {
      try {
        if (error?.code === "LIMIT_FILE_SIZE") {
          throw new ApiError(413, "PROOF_TOO_LARGE", "Proof image must not exceed 5 MiB");
        }
        if (error) throw error;
        if (!request.file) {
          if (required) throw new ApiError(400, "PROOF_REQUIRED", "A proof image is required");
          next();
          return;
        }
        const detectedMime = detectImageMime(request.file.buffer);
        if (detectedMime !== request.file.mimetype) {
          throw new ApiError(400, "PROOF_CONTENT_INVALID", "Proof image content does not match its type");
        }
        const extension = MIME_EXTENSIONS.get(detectedMime);
        const directory = path.resolve(storageRoot, "payments");
        const fileName = `${crypto.randomUUID()}${extension}`;
        const filePath = path.resolve(directory, fileName);
        if (!filePath.startsWith(`${directory}${path.sep}`)) {
          throw new ApiError(400, "PROOF_PATH_INVALID", "Proof path is invalid");
        }
        await mkdir(directory, { recursive: true });
        await writeFile(filePath, request.file.buffer, { flag: "wx", mode: 0o600 });
        request.file = {
          fieldname: request.file.fieldname,
          originalname: request.file.originalname,
          mimetype: detectedMime,
          size: request.file.size,
          filename: fileName,
          path: filePath,
          reference: path.posix.join("payments", fileName)
        };
        next();
      } catch (caught) {
        next(caught);
      }
    });
  };
}

export async function removeUploadedProof(file) {
  if (!file?.path) return;
  await unlink(file.path).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

export function proofResponseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache"
  };
}

function detectImageMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}
