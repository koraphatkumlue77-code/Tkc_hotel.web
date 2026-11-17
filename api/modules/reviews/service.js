import { routeId } from "../payments/contracts.js";
import { hideInput, reviewInput, reviewQuery } from "./contracts.js";
export class ReviewsService { constructor(repository){this.repository=repository;} list(query){return this.repository.list(reviewQuery(query));} create(id,body,p){return this.repository.create(routeId(id,"bookingId"),p.id,reviewInput(body));} hide(id,body,p){return this.repository.hide(routeId(id,"reviewId"),hideInput(body),p.id);} }
