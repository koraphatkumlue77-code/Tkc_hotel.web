import test from "node:test";
import assert from "node:assert/strict";

globalThis.document = { querySelector: () => null };
const { projectStaffLive, hasUnsavedInput } =
  await import("../public/js/staff/live.js");

test("live summaries reflect each department's data without changing task views", () => {
  const overview = {
    rooms: { total: 10, ready: 4, dirty: 2, occupied: 3, repair: 1 },
  };
  const bookings = [
    { status: "confirmed" },
    { status: "checked_in" },
    { status: "replacement_pending" },
  ];
  assert.deepEqual(
    projectStaffLive("reception", [
      overview,
      bookings,
      [{ messageCount: 1 }, { messageCount: 0 }],
    ]),
    { metrics: [3, 4, 2, 1], priorities: [1, 1, 1] },
  );
  assert.deepEqual(
    projectStaffLive("housekeeping", [
      [{ status: "pending" }, { status: "working" }, { status: "done" }],
      [{}, {}],
    ]),
    { metrics: [1, 1, 1, 2], priorities: [1, 1] },
  );
  assert.deepEqual(
    projectStaffLive("superadmin", [overview, [{}], bookings, [{}, {}]]),
    { metrics: [10, 4, 2, 1], priorities: [2, 1, 2] },
  );
  const finance = { received: 200, refunded: 50, net: 150, pendingReviews: 1 };
  assert.deepEqual(
    projectStaffLive("accounting", [
      finance,
      [{}],
      [{ status: "approved" }, { status: "requested" }],
    ]).priorities,
    [1, 1, 1],
  );
  assert.deepEqual(
    projectStaffLive("management", [
      overview,
      finance,
      [{ status: "requested" }],
      [{}, {}],
      [{}],
    ]).priorities,
    [1, 2, 1],
  );
});

test("draft detection protects edited text, choices and uploads from refresh", () => {
  const root = (fields) => ({ querySelectorAll: () => fields });
  assert.equal(
    hasUnsavedInput(
      root([
        { tagName: "INPUT", type: "text", value: "draft", defaultValue: "" },
      ]),
    ),
    true,
  );
  assert.equal(
    hasUnsavedInput(
      root([
        {
          tagName: "INPUT",
          type: "checkbox",
          checked: true,
          defaultChecked: false,
        },
      ]),
    ),
    true,
  );
  assert.equal(
    hasUnsavedInput(root([{ tagName: "INPUT", type: "file", files: [{}] }])),
    true,
  );
  assert.equal(
    hasUnsavedInput(
      root([
        {
          tagName: "SELECT",
          value: "b",
          options: [{ value: "a", defaultSelected: true }, { value: "b" }],
        },
      ]),
    ),
    true,
  );
  assert.equal(
    hasUnsavedInput(
      root([
        { tagName: "INPUT", type: "text", value: "same", defaultValue: "same" },
      ]),
    ),
    false,
  );
});
