import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../../middleware/errors.js";
import { routeId } from "../payments/contracts.js";
import { closureInput, damageInput, decisionReason, historyQuery, reopenInput } from "./contracts.js";
import { removeDamage } from "./upload.js";

export class RoomOperationsService {
  constructor(repository, { storageRoot }) { this.repository = repository; this.storageRoot = path.resolve(storageRoot); }
  listCleaning() { return this.repository.listCleaning(); }
  start(id, principal) { return this.repository.cleaning(routeId(id, "eventId"), "START", principal.id); }
  complete(id, principal) { return this.repository.cleaning(routeId(id, "eventId"), "COMPLETE", principal.id); }
  async reportDamage(roomId, body, file, principal) { try { return await this.repository.reportDamage(routeId(roomId, "roomId"), damageInput(body), file.reference, principal.id); } catch (error) { await removeDamage(file); throw error; } }
  listDamages() { return this.repository.listDamages(); }
  review(id, body, principal) { return this.repository.damageDecision(routeId(id, "eventId"), "DAMAGE_REVIEWED", decisionReason(body), principal.id); }
  resolve(id, body, principal) { return this.repository.damageDecision(routeId(id, "eventId"), "DAMAGE_RESOLVED", decisionReason(body), principal.id); }
  close(roomId, body, principal) { return this.repository.closeRoom(routeId(roomId, "roomId"), closureInput(body), principal.id); }
  reopen(id, body, principal) { return this.repository.reopen(routeId(id, "eventId"), reopenInput(body), principal.id); }
  history(roomId, query) { return this.repository.history(routeId(roomId, "roomId"), historyQuery(query)); }
  async photo(id) { const record = await this.repository.photo(routeId(id, "eventId")); if (!record) throw new ApiError(404, "DAMAGE_PHOTO_NOT_FOUND", "Damage photo was not found"); const match = /^damages\/([0-9a-f-]+)\.(png|jpg|webp)$/.exec(record); if (!match) throw new ApiError(404, "DAMAGE_PHOTO_NOT_FOUND", "Damage photo was not found"); const absolute = path.resolve(this.storageRoot, record); const root = path.resolve(this.storageRoot, "damages"); if (!absolute.startsWith(`${root}${path.sep}`)) throw new ApiError(404, "DAMAGE_PHOTO_NOT_FOUND", "Damage photo was not found"); try { return { data: await readFile(absolute), type: { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[match[2]] }; } catch (error) { if (error?.code === "ENOENT") throw new ApiError(404, "DAMAGE_PHOTO_NOT_FOUND", "Damage photo was not found"); throw error; } }
}
