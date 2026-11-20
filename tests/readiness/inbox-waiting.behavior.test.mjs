import test from "node:test";
import assert from "node:assert/strict";

import { describeLastMessage, groupWaiting, isRecentWait, summarizeWaiting, waitKind } from "../../lib/inbox-waiting.ts";

const NOW = Date.parse("2026-11-20T09:00:00Z");
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();

test("waiting means wrote in the last 7 days", () => {
  assert.equal(isRecentWait(ago(2), NOW), true);
  assert.equal(isRecentWait(ago(24 * 7 - 1), NOW), true);
  assert.equal(isRecentWait(ago(24 * 8), NOW), false);
  assert.equal(isRecentWait(null, NOW), false);
});

test("last messages read like a person said them", () => {
  assert.equal(describeLastMessage("Shared an Instagram reel https://www.instagram.com/reel/x/"), "Shared a reel");
  assert.equal(describeLastMessage("Shared an Instagram post Your cravings are not your fault"), "Shared a post");
  assert.equal(describeLastMessage("[Instagram story_reply message]"), "Replied to your story");
  assert.equal(describeLastMessage("[Instagram ig_story message]"), "Mentioned you in a story");
  assert.equal(describeLastMessage("[Instagram ephemeral message]"), "Sent a disappearing photo or video");
  assert.equal(describeLastMessage("  Is accommodation\n provided? "), "Is accommodation provided?");
  assert.equal(describeLastMessage("Shared an Instagram image\nhttps://x"), "Sent a photo");
  assert.equal(describeLastMessage("Shared an Instagram voice message\nhttps://x"), "Sent a voice message");
  assert.equal(describeLastMessage("Mentioned you in an Instagram story\nhttps://x"), "Mentioned you in a story");
  assert.equal(describeLastMessage("[Instagram image]"), "Sent a photo");
  assert.equal(describeLastMessage("[Instagram historical message]"), "Older message (text not available)");
});

test("questions, messages and shares are told apart", () => {
  assert.equal(waitKind("Is accommodation provided?"), "question");
  assert.equal(waitKind("I'm interested in enrolling myself for the prenatal program"), "question");
  assert.equal(waitKind("I will inform you I am looking for yoga and meditation"), "message");
  assert.equal(waitKind("Ok ...."), "message");
  assert.equal(waitKind("Shared an Instagram reel https://x"), "share");
  assert.equal(waitKind("[Instagram story_reply message]"), "share");
  assert.equal(waitKind(""), "share");
  assert.equal(waitKind("Shared an Instagram image\nhttps://x"), "share");
  assert.equal(waitKind("Mentioned you in an Instagram story\nhttps://x"), "share");
  assert.equal(waitKind("Is there a payment plan?"), "question");
  assert.equal(waitKind("I've made the payment", true), "paid");
});

test("groups come paid → question → message → share, longest wait first", () => {
  const rows = [
    { id: "s", waitingSince: ago(4), kind: "share" },
    { id: "q1", waitingSince: ago(40), kind: "question" },
    { id: "q2", waitingSince: ago(70), kind: "question" },
    { id: "p", waitingSince: ago(5), kind: "paid" },
  ];
  assert.deepEqual(groupWaiting(rows).map((g) => [g.kind, g.rows.map((r) => r.id)]), [
    ["paid", ["p"]], ["question", ["q2", "q1"]], ["share", ["s"]],
  ]);
});

test("the overview sentence counts what people sent", () => {
  const rows = [
    { id: "a", waitingSince: ago(3), kind: "question" },
    { id: "b", waitingSince: ago(50), kind: "question" },
    { id: "c", waitingSince: ago(20), kind: "message" },
    { id: "d", waitingSince: ago(30), kind: "share" },
    { id: "e", waitingSince: ago(10), kind: "share" },
  ];
  const s = summarizeWaiting(rows, NOW);
  assert.equal(s.headline, "5 people wrote this week and are waiting. 2 asked a question, 1 sent a message, and 2 only shared a reel or reacted to a story.");
  assert.equal(s.last24h, 3);
  assert.equal(s.oldestQuestionDays, 2);
  assert.equal(summarizeWaiting([], NOW).headline, "Nobody is waiting for a reply right now.");
});
