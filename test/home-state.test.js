import test from "node:test";
import assert from "node:assert/strict";
import {
  reservationSummary,
  roomImage,
  accountReturnPath,
} from "../public/js/home-state.js";

test("home indicators count current reservations and purchased facilities, excluding cancelled and finished stays", () => {
  const summary = reservationSummary(
    [
      {
        status: "pending_review",
        check_out: "2026-12-20",
        rooms: [{ typeId: 1 }, { typeId: 1 }],
        services: [{ kind: "fitness" }],
        tours: [{ status: "reserved" }, { status: "cancelled" }],
      },
      {
        status: "confirmed",
        check_out: "2026-12-21",
        rooms: [{ typeId: 2 }],
        services: [{ kind: "sauna" }],
      },
      {
        status: "cancelled",
        check_out: "2026-12-20",
        rooms: [{ typeId: 1 }],
        services: [],
      },
      {
        status: "checked_out",
        check_out: "2026-12-10",
        rooms: [{ typeId: 1 }],
        services: [],
      },
      {
        status: "held",
        check_out: "2026-12-20",
        hold_until: "2026-11-01T00:00:00Z",
        rooms: [{ typeId: 1 }],
        services: [],
      },
    ],
    new Date("2026-11-14T12:00:00Z"),
  );
  assert.equal(summary.rooms[1], 2);
  assert.equal(summary.rooms[2], 1);
  assert.equal(summary.fitness, true);
  assert.equal(summary.sauna, true);
  assert.equal(summary.tours, 1);
  assert.deepEqual(reservationSummary([], new Date()).rooms, {});
});

test("each default room type has a distinct image while custom management images survive", () => {
  const images = ["Standard", "Superior", "Deluxe", "Family"].map((name) =>
    roomImage({ name }),
  );
  assert.equal(new Set(images).size, 4);
  assert.equal(
    roomImage({ name: "Superior", imageUrl: "/assets/room-standard.jpg" }),
    "/assets/room-superior.jpg",
  );
  assert.equal(
    roomImage({ name: "Superior", imageUrl: "/assets/custom.jpg" }),
    "/assets/custom.jpg",
  );
  assert.equal(
    roomImage({ name: "Superior", imageUrl: "https://example.test/room.jpg" }),
    "/assets/room-superior.jpg",
  );
});

test("login return destinations allow only the local profile", () => {
  assert.equal(
    accountReturnPath("/account.html?bookingId=4#trips"),
    "/account.html?bookingId=4#trips",
  );
  for (const path of [
    "https://evil.test/account.html",
    "//evil.test",
    "/staff/superadmin.html",
    "/account.html.evil",
    "/account.html\\evil",
  ])
    assert.equal(accountReturnPath(path), null);
});
