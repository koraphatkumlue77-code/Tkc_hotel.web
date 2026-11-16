import assert from "node:assert/strict";
import test from "node:test";
import { reviewInput } from "../modules/reviews/contracts.js";
import { messageInput } from "../modules/chat/contracts.js";
import { employeeInput } from "../modules/employees/contracts.js";

test("review, chat, and employee contracts normalize valid input", () => {
  assert.deepEqual(reviewInput({ rating: 5, content: " Great stay " }), { rating: 5, content: "Great stay" });
  assert.deepEqual(messageInput({ message: " Hello reception " }), { message: "Hello reception" });
  assert.deepEqual(employeeInput({ name: " New Staff ", email: " STAFF@EXAMPLE.TEST ", department: " Front ", role: "reception", active: true, password: "StaffPassword123!" }, true),
    { name: "New Staff", email: "staff@example.test", department: "Front", role: "RECEPTION", active: true, password: "StaffPassword123!" });
});

test("review, chat, and employee contracts reject unsafe input", () => {
  assert.throws(() => reviewInput({ rating: 6, content: "Bad" }), (error) => error.status === 400);
  assert.throws(() => messageInput({ message: " ".repeat(3) }), (error) => error.status === 400);
  assert.throws(() => employeeInput({ name: "X", email: "bad", department: "Y", role: "root", active: true, password: "short" }, true), (error) => error.status === 400);
});
