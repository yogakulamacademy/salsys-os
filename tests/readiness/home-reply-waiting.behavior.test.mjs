import test from "node:test";
import assert from "node:assert/strict";
import { calculateHomeReplyWaitingBreakdown } from "../../lib/home-reply-waiting.ts";

test("valid reply-waiting evidence yields an exact, bounded breakdown", () => {
  assert.deepEqual(calculateHomeReplyWaitingBreakdown(4, 1), {
    older: 1,
    recent: 3,
    percentOverHour: 25,
  });
  assert.deepEqual(calculateHomeReplyWaitingBreakdown(5, 0), {
    older: 0,
    recent: 5,
    percentOverHour: 0,
  });
  assert.deepEqual(calculateHomeReplyWaitingBreakdown(5, 5), {
    older: 5,
    recent: 0,
    percentOverHour: 100,
  });
});

test("invalid and contradictory values do not produce plausible percentages", () => {
  for (const [total, overdue] of [
    [0, 0], [0, 2], [-1, 0], [1, -1], [2, 3], [2, 0.5],
    [Number.NaN, 0], [2, Infinity], [Number.MAX_SAFE_INTEGER + 1, 0],
  ]) {
    assert.equal(calculateHomeReplyWaitingBreakdown(total, overdue), null);
  }
});
