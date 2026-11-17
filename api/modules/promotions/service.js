import { routeId } from "../payments/contracts.js";
import { attractionInput, promotionInput } from "./contracts.js";

export class PromotionsService {
  constructor(repository) { this.repository = repository; }
  listPromotions() { return this.repository.listPromotions(); }
  createPromotion(body, principal) { return this.repository.savePromotion(null, promotionInput(body), principal.id); }
  updatePromotion(id, body, principal) { return this.repository.savePromotion(routeId(id, "promotionId"), promotionInput(body), principal.id); }
  listAttractions() { return this.repository.listAttractions(); }
  listManageableAttractions() { return this.repository.listManageableAttractions(); }
  createAttraction(body, principal) { return this.repository.saveAttraction(null, attractionInput(body), principal.id); }
  updateAttraction(id, body, principal) { return this.repository.saveAttraction(routeId(id, "serviceId"), attractionInput(body), principal.id); }
}
