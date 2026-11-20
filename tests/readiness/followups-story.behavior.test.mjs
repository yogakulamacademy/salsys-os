import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFollowupsStory, classifyTask, dueLabel, formLabel, snoozeTarget, whyLine,
} from "../../lib/followups-story.ts";

const NOW = new Date("2026-11-20T06:00:00Z"); // 11:30 IST

function task(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2), leadId: "l1", leadName: "Asha", leadCode: "LD-1", stage: "engaged",
    title: "Follow-up", description: null, dueAt: "2026-11-19T04:30:00Z", createdById: null, taskType: "follow_up",
    channel: "instagram", origin: null, lastInboundAt: null, lastOutboundAt: null, lastInboundText: null,
    value: null, currency: null, course: null, ...over,
  };
}

test("tasks sort into the job they really are", () => {
  assert.equal(classifyTask(task({ createdById: "ai_stage_lost_v1" })), "lost");
  assert.equal(classifyTask(task({ createdById: "ai_autopilot_v1" })), "handover");
  assert.equal(classifyTask(task({ createdById: "ai_followup_detection_v1" })), "promised");
  assert.equal(classifyTask(task({ title: "Payment follow-up" })), "payment");
  assert.equal(classifyTask(task({ taskType: "payment_check" })), "payment");
  assert.equal(classifyTask(task({ title: "First contact — new enquiry" })), "first_reply");
  assert.equal(classifyTask(task({ title: "Call back" })), "other");
});

test("why-lines quote the lead, not the system", () => {
  const promised = task({ createdById: "ai_followup_detection_v1", description: 'Set by AI from the lead\'s message: "Interested but I enroll later ..not now"' });
  assert.equal(whyLine(promised, "promised"), "They said: “Interested but I enroll later ..not now”");
  const lost = task({ description: "From their messages: LEAD: No (in reply to 'interested?'). Move to Lost if you agree, or reply to win them back." });
  assert.equal(whyLine(lost, "lost"), "They said: “No (in reply to 'interested?')”");
  const handover = task({ title: "AI handed over: Lead shared a reel or post not about yoga" });
  assert.equal(whyLine(handover, "handover"), "AI stopped: lead shared a reel or post not about yoga");
  assert.equal(formLabel("Website Reservation Form"), "Reservation form");
  assert.equal(whyLine(task({ origin: "Website Brochure Form" }), "first_reply"), "Brochure form · no reply logged in the CRM yet");
});

test("due labels count India calendar days", () => {
  assert.deepEqual(dueLabel("2026-11-19T04:30:00Z", NOW), { label: "1 day late", late: true, daysLate: 1 });
  assert.equal(dueLabel("2026-10-29T06:00:00Z", NOW).label, "22 days late");
  assert.equal(dueLabel("2026-11-20T03:00:00Z", NOW).label, "Due today");
  assert.equal(dueLabel("2026-11-21T04:30:00Z", NOW).label, "Tomorrow");
  assert.equal(dueLabel("2026-11-27T04:30:00Z", NOW).label, "In 7 days");
});

test("snooze presets land at 10:00 India time", () => {
  assert.equal(snoozeTarget(1, NOW), "2026-11-21T04:30:00.000Z");
  assert.equal(snoozeTarget(7, new Date("2026-11-20T20:00:00Z")), "2026-11-28T04:30:00.000Z");
});

test("story: settled leads drop out of the counts; hot forms come first", () => {
  const story = buildFollowupsStory([
    task({ id: "a", title: "First contact — new enquiry", origin: "Website Brochure Form", stage: "new", dueAt: "2026-11-18T06:00:00Z" }),
    task({ id: "b", title: "First contact — new enquiry", origin: "Website Reservation Form", stage: "new", dueAt: "2026-10-29T06:00:00Z" }),
    task({ id: "c", title: "First contact — new enquiry", origin: "Website Brochure Form", stage: "closed_won" }),
    task({ id: "d", createdById: "ai_stage_lost_v1" }),
    task({ id: "e", createdById: "ai_followup_detection_v1", lastInboundAt: "2026-11-17T06:00:00Z" }),
    task({ id: "f", createdById: "ai_followup_detection_v1", dueAt: "2026-11-23T04:30:00Z" }),
  ], NOW);
  assert.equal(story.dueNow, 5);
  assert.equal(story.upcomingWeek, 1);
  assert.equal(story.counts.first_reply, 2);
  assert.equal(story.settled, 1);
  assert.equal(story.oldestFormDays, 22);
  assert.equal(story.waiting, 0, "'I'll get back to you' is their last word, not a wait on us");
  const forms = story.due.filter((t) => t.kind === "first_reply").map((t) => t.id);
  assert.deepEqual(forms, ["b", "a", "c"]);
  assert.equal(
    story.headline,
    "1 person asked you to get back to them and it's time and 2 website forms have no reply logged (oldest 22 days). Also 1 Lost suggestion to confirm and 1 task is for leads already settled and can be closed.",
  );
});

test("an empty queue says so", () => {
  assert.equal(buildFollowupsStory([], NOW).headline, "Nothing urgent is waiting.");
});

test("people who say they paid go first, and website forms with no reply count as waiting", () => {
  const story = buildFollowupsStory([
    task({ id: "p1", title: "Payment follow-up", stage: "payment_pending", lastInboundAt: "2026-11-10T06:00:00Z" }),
    task({ id: "p2", title: "Payment follow-up", stage: "payment_pending", saysPaid: true, lastInboundAt: "2026-11-06T06:00:00Z" }),
  ], NOW);
  assert.deepEqual(story.due.map((t) => t.id), ["p2", "p1"]);
  assert.match(story.due[0].why, /wrote that they paid/);
  assert.equal(story.waiting, 2);
  assert.ok(story.headline.startsWith("2 payments need checking (1 say they've paid)"));
});
