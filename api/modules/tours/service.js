import { routeId } from "../payments/contracts.js";
import { roundInput, roundsQuery, tourParticipant } from "./contracts.js";

export class ToursService {
  constructor(repository) { this.repository = repository; }
  listRounds(query) { return this.repository.listRounds(roundsQuery(query, today())); }
  createRound(body, principal) { return this.repository.saveRound(null, roundInput(body), principal.id); }
  updateRound(id, body, principal) { return this.repository.saveRound(routeId(id, "roundId"), roundInput(body), principal.id); }
  add(bookingId, body, principal) { return this.repository.add(routeId(bookingId, "bookingId"), principal.id, tourParticipant(body)); }
  cancel(bookingId, reservationId, principal) { return this.repository.cancel(routeId(bookingId, "bookingId"), routeId(reservationId, "reservationId"), principal.id); }
}
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
