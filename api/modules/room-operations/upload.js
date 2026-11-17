import crypto from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { ApiError } from "../../middleware/errors.js";

const TYPES = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
export function createDamageUpload({ storageRoot }) {
  const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => callback(TYPES.has(file.mimetype) ? null : new ApiError(400, "DAMAGE_PHOTO_TYPE_INVALID", "Photo must be JPEG, PNG, or WebP"), TYPES.has(file.mimetype)) }).single("photo");
  return (request, response, next) => receive(request, response, async (error) => {
    try {
      if (error?.code === "LIMIT_FILE_SIZE") throw new ApiError(413, "DAMAGE_PHOTO_TOO_LARGE", "Photo must not exceed 5 MiB");
      if (error) throw error; if (!request.file) throw new ApiError(400, "DAMAGE_PHOTO_REQUIRED", "A damage photo is required");
      const mime = detect(request.file.buffer); if (mime !== request.file.mimetype) throw new ApiError(400, "DAMAGE_PHOTO_CONTENT_INVALID", "Photo content does not match its type");
      const directory = path.resolve(storageRoot, "damages"); const name = `${crypto.randomUUID()}${TYPES.get(mime)}`; const filePath = path.resolve(directory, name);
      await mkdir(directory, { recursive: true }); await writeFile(filePath, request.file.buffer, { flag: "wx", mode: 0o600 });
      request.file = { ...request.file, path: filePath, reference: path.posix.join("damages", name), mimetype: mime }; next();
    } catch (caught) { next(caught); }
  });
}
export async function removeDamage(file) { if (file?.path) await unlink(file.path).catch((error) => { if (error?.code !== "ENOENT") throw error; }); }
export function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" }; }
function detect(buffer) { if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png"; if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg"; if (buffer.length >= 12 && buffer.subarray(0,4).toString("ascii") === "RIFF" && buffer.subarray(8,12).toString("ascii") === "WEBP") return "image/webp"; return null; }
