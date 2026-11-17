import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MIN_WON_FOR_LEARNED_CONFIDENCE, nextStepFor, scoreLead } from '../../lib/lead-score.ts';

const base = { stage: 'engaged', signals: [], courseSelected: false, inbound: 1, outbound: 1, needsReply: false, waitingMinutes: null, daysSinceLastInbound: 1, hasOpenFollowup: false, wonLeadsInOrg: 3 };

test('a ready-to-pay lead scores hot with a now next step', () => {
  const s = scoreLead({ ...base, stage: 'qualified', signals: ['Wants to apply', 'Talking about payment', 'Asked about price'], courseSelected: true, inbound: 4, outbound: 3, needsReply: true, waitingMinutes: 20 });
  assert.equal(s.band, 'hot');
  assert.ok(s.score >= 75);
  assert.equal(s.nextStep.urgency, 'now');
  assert.match(s.nextStep.title, /registration step/);
  assert.equal(s.factors[0].label, 'Qualified: course and timing fit');
});

test('a quiet "not now" lead scores cold and rests', () => {
  const s = scoreLead({ ...base, followupRequested: 'not_now', daysSinceLastInbound: 20, hasOpenFollowup: true });
  assert.equal(s.band, 'cold');
  assert.equal(s.nextStep.urgency, 'later');
  assert.ok(s.confidence <= 5);
});

test('confidence is an early estimate, capped, until enough wins', () => {
  const hot = { ...base, stage: 'payment_pending', signals: ['Talking about payment', 'Wants to apply'], courseSelected: true, inbound: 5, outbound: 4, paymentStarts7d: 1, engagementScore: 80 };
  const early = scoreLead(hot);
  assert.equal(early.confidenceLabel, 'Early estimate');
  assert.ok(early.confidence <= 70);
  assert.match(early.confidenceNote, /Only 3 won leads/);
  const learned = scoreLead({ ...hot, wonLeadsInOrg: MIN_WON_FOR_LEARNED_CONFIDENCE });
  assert.equal(learned.confidenceLabel, 'Based on your won leads');
  assert.ok(learned.confidence > 70);
});

test('waiting on us is penalised and drives the next step', () => {
  const s = scoreLead({ ...base, signals: ['Asked about price'], needsReply: true, waitingMinutes: 2000 });
  assert.ok(s.factors.some((f) => f.label === 'Waiting on us for over a day' && f.points === -10));
  assert.match(s.nextStep.title, /fees/);
});

test('next step covers the main situations', () => {
  assert.match(nextStepFor({ ...base, needsReply: true, signals: ['Asking for a deal'] }).title, /offer/);
  assert.match(nextStepFor({ ...base, needsReply: true }).title, /which course/);
  assert.match(nextStepFor({ ...base, stage: 'payment_pending' }).title, /payment/);
  assert.match(nextStepFor({ ...base, daysSinceLastInbound: 4 }).title, /Schedule a follow-up/);
  assert.match(nextStepFor({ ...base, stage: 'lost' }).title, /No action/);
  assert.equal(scoreLead({ ...base, stage: 'lost' }).score <= 10, true);
});

test('card shows score, confidence label, reasons and next step', () => {
  const card = readFileSync(new URL('../../components/inbox-lead-intelligence.tsx', import.meta.url), 'utf8');
  for (const s of ['likely to pay in 30 days', 'Why this score', 'Next step', 'score.confidenceLabel']) assert.ok(card.includes(s), s);
  const page = readFileSync(new URL('../../app/conversations/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<InboxLeadIntelligence intel=\{leadIntel\} score=\{leadScore\} \/>/);
});
