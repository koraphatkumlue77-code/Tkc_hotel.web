import { routeId } from "../payments/contracts.js";
import { serviceSelection, staffServiceSelection } from "./contracts.js";

export class ServicesService {
  constructor(repository) {
    this.repository = repository;
  }

  list() {
    return this.repository.list();
  }

  addMine(bookingId, body, principal) {
    return this.repository.addCustomer(
      routeId(bookingId, "bookingId"), principal.id, serviceSelection(body)
    );
  }

  cancelMine(bookingId, bookingServiceId, principal) {
    return this.repository.cancelCustomer(
      routeId(bookingId, "bookingId"),
      routeId(bookingServiceId, "bookingServiceId"),
      principal.id
    );
  }

  addStaff(bookingId, body, principal) {
    return this.repository.addStaff(
      routeId(bookingId, "bookingId"), principal.id, staffServiceSelection(body)
    );
  }
}
