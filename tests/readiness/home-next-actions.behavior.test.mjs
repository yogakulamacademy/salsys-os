import test from "node:test";
import assert from "node:assert/strict";
import { buildHomeNextActions } from "../../lib/home-next-actions.ts";

const zero = {
  needsReply: 0,
  waitingOverHour: 0,
  followupsDue: 0,
  needsFirstTouch: 0,
  paymentPending: 0,
  missingOpportunityValue: null,
};

test("returns a stable empty action queue for a fully observed zero backlog", () => {
  assert.deepEqual(buildHomeNextActions(zero), []);
});

test("observed overdue conversations outrank overdue follow-ups, not merely the largest queue", () => {
  const result = buildHomeNextActions({
    ...zero,
    needsReply: 2,
    waitingOverHour: 1,
    followupsDue: 40,
    needsFirstTouch: 900,
    paymentPending: 80,
    missingOpportunityValue: 250,
  });
  assert.deepEqual(result.map((item) => item.id), [
    "reply-queue", "overdue-followups", "first-touch", "payment-stage", "missing-valuation",
  ]);
  assert.equal(result[0].priority, "Immediate");
  assert.equal(result[0].href, "/conversations");
  assert.equal(result[1].priority, "Due");
  assert.equal(result[4].href, "/revenue/valuation");
});

test("scheduled overdue work outranks conversations without evidence of prolonged wait", () => {
  const result = buildHomeNextActions({
    ...zero, needsReply: 50, waitingOverHour: 0, followupsDue: 1,
  });
  assert.equal(result[0].id, "overdue-followups");
  assert.equal(result[1].id, "reply-queue");
});

test("unknown or inconsistent waiting-time evidence must not create an SLA claim", () => {
  for (const waitingOverHour of [null, undefined, -1, 15, Number.NaN, Infinity]) {
    const result = buildHomeNextActions({
      ...zero,
      needsReply: 10,
      waitingOverHour,
      followupsDue: 1,
    });
    assert.equal(result[0].id, "overdue-followups");
    const reply = result.find((item) => item.id === "reply-queue");
    assert.equal(reply?.priority, "Work queue");
    assert.match(reply?.timing ?? "", /unverified/);
  }
});

test("unavailable valuation evidence does not become a zero or a fabricated recommendation", () => {
  const result = buildHomeNextActions({
    ...zero, missingOpportunityValue: null, paymentPending: 3,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "payment-stage");
  assert.match(result[0].evidence, /not settled payments/);
});

test("invalid counts cannot create actionable tasks and repeat calls preserve ordering", () => {
  const input = {
    needsReply: -1,
    waitingOverHour: 400,
    followupsDue: Number.NaN,
    needsFirstTouch: 2.7,
    paymentPending: 5,
    missingOpportunityValue: 12,
  };
  const first = buildHomeNextActions(input);
  assert.deepEqual(first.map((item) => item.id), ["payment-stage", "missing-valuation"]);
  assert.deepEqual(buildHomeNextActions(input), first);
  assert.ok(first.every((item) => item.value > 0));
});

test("first-touch routes to lead workspace instead of claiming unassigned means unreplied", () => {
  const result = buildHomeNextActions({ ...zero, needsFirstTouch: 3 });
  assert.equal(result[0].href, "/leads");
  assert.match(result[0].evidence, /outbound contact/);
});
