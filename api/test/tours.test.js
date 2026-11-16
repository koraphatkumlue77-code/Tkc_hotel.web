import assert from "node:assert/strict";
import test from "node:test";
import { roundInput, tourParticipant } from "../modules/tours/contracts.js";

test("tour contracts normalize rounds and participant identifiers", () => {
  assert.deepEqual(roundInput({ serviceId: 5, tourDate: "2037-04-10", startTime: "18:00", capacity: 10, status: "open" }),
    { serviceId: 5, tourDate: "2037-04-10", startTime: "18:00:00", capacity: 10, status: "OPEN" });
  assert.deepEqual(tourParticipant({ tourRoundId: 2, participantCode: " guest-1 ", participantName: " Somchai " }),
    { tourRoundId: 2, participantCode: "GUEST-1", participantName: "Somchai" });
});

test("tour contracts reject malformed dates, times, capacity, and participant codes", () => {
  for (const body of [
    { serviceId: 5, tourDate: "2037-02-30", startTime: "18:00", capacity: 10, status: "OPEN" },
    { serviceId: 5, tourDate: "2037-04-10", startTime: "25:00", capacity: 10, status: "OPEN" },
    { serviceId: 5, tourDate: "2037-04-10", startTime: "18:00", capacity: 0, status: "OPEN" }
  ]) assert.throws(() => roundInput(body), (error) => error.status === 400);
  assert.throws(() => tourParticipant({ tourRoundId: 1, participantCode: "bad code!", participantName: "X" }), (error) => error.status === 400);
});
