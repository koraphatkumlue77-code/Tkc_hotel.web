import { routeId } from "../payments/contracts.js";
import { refundDecision, refundPayout, refundRequest, refundsQuery } from "./contracts.js";
export class RefundsService {
  constructor(repository) { this.repository = repository; }
  request(paymentId, body, principal) { return this.repository.request(routeId(paymentId, "paymentId"), refundRequest(body), principal.id); }
  list(query) { return this.repository.list(refundsQuery(query)); }
  decide(refundId, decision, body, principal) { return this.repository.decide(routeId(refundId, "refundId"), decision, refundDecision(body), principal.id); }
  payout(refundId, body, principal) { return this.repository.payout(routeId(refundId, "refundId"), refundPayout(body), principal.id); }
}
