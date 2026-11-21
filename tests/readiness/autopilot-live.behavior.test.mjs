import test from 'node:test';
import assert from 'node:assert/strict';

import { draftIsUnsafe, eligibleNewLead, istDayStart, liveHardStop, nudgeDue, parseAssessment, sendDecision, windowOpen } from '../../lib/autopilot-live.ts';

const NOW = new Date('2026-11-18T10:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

test('payment, refund, health and bargaining always go to a person', () => {
  assert.equal(liveHardStop('I paid, sharing the screenshot'), 'payment');
  assert.equal(liveHardStop('Please send the payment link'), 'payment');
  assert.equal(liveHardStop('I want a refund'), 'refund_or_complaint');
  assert.equal(liveHardStop('Can I join in my second trimester?'), 'health');
  assert.equal(liveHardStop('Can you reduce the fee a bit more?'), 'bargaining');
  assert.equal(liveHardStop('Is there a scholarship?'), 'bargaining');
  // Ordinary questions the AI may answer from approved knowledge:
  for (const q of ['Is there a payment plan?', 'What is the fee for 200 hour?', 'When is the next batch?', 'Is accommodation included?', 'Is there any offer running?']) {
    assert.equal(liveHardStop(q), null, q);
  }
});

test('replies never carry payment details', () => {
  assert.equal(draftIsUnsafe('Here is the payment link: rzp.io/abc'), true);
  assert.equal(draftIsUnsafe('Our UPI is yogakulam@okhdfc'), true);
  assert.equal(draftIsUnsafe('Account number 123456789012'), true);
  assert.equal(draftIsUnsafe('The fee is ₹25,000 and you can pay in 2 instalments.'), false);
});

test('Instagram 24h window and new-lead pilot rules', () => {
  assert.equal(windowOpen(hoursAgo(2), NOW), true);
  assert.equal(windowOpen(hoursAgo(23.95), NOW), false);
  assert.equal(eligibleNewLead({ leadCreatedAt: hoursAgo(3), stage: 'new', humanRepliesInThread: 0, now: NOW }), true);
  assert.equal(eligibleNewLead({ leadCreatedAt: hoursAgo(72), stage: 'new', humanRepliesInThread: 0, now: NOW }), false);
  assert.equal(eligibleNewLead({ leadCreatedAt: hoursAgo(3), stage: 'new', humanRepliesInThread: 1, now: NOW }), false);
  assert.equal(eligibleNewLead({ leadCreatedAt: hoursAgo(3), stage: 'enrolled', humanRepliesInThread: 0, now: NOW }), false);
  assert.equal(eligibleNewLead({ leadCreatedAt: hoursAgo(3), stage: 'new', humanRepliesInThread: 0, now: NOW, pilotStartedAt: hoursAgo(1) }), false);
  assert.equal(istDayStart(new Date('2026-11-18T20:00:00Z')).toISOString(), '2026-11-18T18:30:00.000Z');
});

test('one nudge, only after 20h of silence and before the window closes', () => {
  const base = { lastInboundAt: hoursAgo(21), lastAiAt: hoursAgo(20.9), lastMessageFromAi: true, nudgesSinceInbound: 0, now: NOW };
  assert.equal(nudgeDue(base), true);
  assert.equal(nudgeDue({ ...base, lastInboundAt: hoursAgo(10) }), false);
  assert.equal(nudgeDue({ ...base, lastInboundAt: hoursAgo(23.5) }), false);
  assert.equal(nudgeDue({ ...base, nudgesSinceInbound: 1 }), false);
  assert.equal(nudgeDue({ ...base, lastMessageFromAi: false }), false);
});

test('sends only when confident, supported and no person is needed', () => {
  const ok = parseAssessment({ confidence: 0.9, facts_supported: true, needs_person: false, reason: 'Answered from knowledge.' });
  assert.deepEqual(sendDecision({ assessment: ok, draft: 'Hi! The next batch starts 7 Dec.', routerRisk: 'low' }), { send: true });
  assert.equal(sendDecision({ assessment: { ...ok, confidence: 0.7 }, draft: 'x', routerRisk: 'low' }).reason, 'low_confidence');
  assert.equal(sendDecision({ assessment: { ...ok, factsSupported: false }, draft: 'x', routerRisk: 'low' }).reason, 'unsupported_fact');
  assert.equal(sendDecision({ assessment: { ...ok, needsPerson: true }, draft: 'x', routerRisk: 'low' }).reason, 'needs_person');
  assert.equal(sendDecision({ assessment: ok, draft: 'x', routerRisk: 'review' }).reason, 'needs_person');
  assert.equal(sendDecision({ assessment: null, draft: 'x', routerRisk: 'low' }).reason, 'low_confidence');
  assert.equal(sendDecision({ assessment: ok, draft: 'Pay via UPI yogakulam@ok', routerRisk: 'low' }).reason, 'draft_unsafe');
  assert.equal(parseAssessment({ confidence: 'high' }), null);
});

test('off-topic shares have a handover label', async () => {
  const { HANDOVER_LABELS } = await import('../../lib/autopilot-live.ts');
  assert.match(HANDOVER_LABELS.off_topic_share, /not about yoga/);
});

test('a lead whose course starts within 24 hours goes to the team', async () => {
  const { batchStartAt, batchStartsSoon, HANDOVER_LABELS } = await import('../../lib/autopilot-live.ts');
  // 15 Dec 18:00 IST = 15 Dec 12:30 UTC
  assert.equal(batchStartAt({ startDate: '2026-12-15', startTime: '18:00:00', timezone: 'Asia/Kolkata' }), Date.parse('2026-12-15T12:30:00Z'));
  assert.equal(batchStartAt({ startDate: '2026-12-15', startTime: null, timezone: null }), Date.parse('2026-12-14T18:30:00Z'));
  const batch = { startDate: '2026-12-15', startTime: '18:00:00', timezone: 'Asia/Kolkata' };
  assert.equal(batchStartsSoon(batch, new Date('2026-12-14T13:00:00Z')), true);   // 23.5h before
  assert.equal(batchStartsSoon(batch, new Date('2026-12-14T12:00:00Z')), false);  // 24.5h before
  assert.equal(batchStartsSoon(batch, new Date('2026-12-15T14:00:00Z')), true);   // already started today
  assert.equal(batchStartsSoon(null, new Date()), false);
  assert.match(HANDOVER_LABELS.batch_starting_soon, /24 hours/);
});

import { linkFollowupDue } from '../../lib/autopilot-live.ts';

test('link follow-up: real open, no reply, 2–6 h later, window open, daytime, once', () => {
  const base = {
    sentAt: '2026-11-21T04:00:00Z',        // 9:30 IST
    firstOpenedAt: '2026-11-21T04:30:00Z', // opened 30 min later
    lastInboundAt: '2026-11-21T03:58:00Z', // asked the fee just before
    lastOutboundAt: '2026-11-21T04:00:00Z',
    timeZone: 'Asia/Kolkata',
  };
  const at = (iso) => new Date(iso);
  assert.equal(linkFollowupDue({ ...base, now: at('2026-11-21T07:00:00Z') }), true);   // 2.5 h after open, 12:30 IST
  assert.equal(linkFollowupDue({ ...base, now: at('2026-11-21T05:00:00Z') }), false);  // too soon
  assert.equal(linkFollowupDue({ ...base, now: at('2026-11-21T11:00:00Z') }), false);  // over 6 h
  assert.equal(linkFollowupDue({ ...base, lastInboundAt: '2026-11-21T05:00:00Z', now: at('2026-11-21T07:00:00Z') }), false); // they replied
  assert.equal(linkFollowupDue({ ...base, lastOutboundAt: '2026-11-21T06:00:00Z', now: at('2026-11-21T07:00:00Z') }), false); // already followed up
  assert.equal(linkFollowupDue({ ...base, firstOpenedAt: null, now: at('2026-11-21T07:00:00Z') }), false); // never opened
  // Night in the lead's time zone (New York 2 am)
  assert.equal(linkFollowupDue({ ...base, timeZone: 'America/New_York', now: at('2026-11-21T07:00:00Z') }), false);
});
