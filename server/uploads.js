import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { requireRole, requireUser } from "./auth.js";
import { asyncRoute, fail } from "./errors.js";

const directory = resolve("uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      mkdir(directory, { recursive: true }).then(() => cb(null, directory), cb);
    },
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

export function validImageSignature(bytes) {
  return (
    (bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )) ||
    (bytes.length >= 3 &&
      bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
    (bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP")
  );
}

export function uploadRoutes(app) {
  app.post(
    "/api/uploads",
    requireRole("member", "housekeeping", "accounting", "reception"),
    upload.single("file"),
    asyncRoute(async (req, res) => {
      if (!req.file) fail(400, "กรุณาแนบไฟล์ JPG, PNG หรือ WebP ไม่เกิน 2 MB");
      const bytes = await readFile(req.file.path);
      if (!validImageSignature(bytes)) {
        await unlink(req.file.path);
        fail(400, "ไฟล์ไม่ใช่รูปภาพที่รองรับ");
      }
      res
        .status(201)
        .json({ path: `uploads/${req.file.filename}`, size: req.file.size });
    }),
  );
  app.get(
    "/api/uploads/:filename",
    requireRole(
      "accounting",
      "management",
      "superadmin",
      "reception",
      "housekeeping",
    ),
    asyncRoute(async (req, res) => {
      if (
        basename(req.params.filename) !== req.params.filename ||
        !/^[0-9a-f-]{36}$/.test(req.params.filename)
      )
        fail(400, "ชื่อไฟล์ไม่ถูกต้อง");
      res.sendFile(resolve(directory, req.params.filename));
    }),
  );
}
