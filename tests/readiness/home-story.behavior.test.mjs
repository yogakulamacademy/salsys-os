import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeStory, busiestWindow, funnelInsight, istHour, waitedFor } from '../../lib/home-story.ts';
import { groupHomePipelineStages } from '../../lib/home-stage-groups.ts';

const now = new Date('2026-11-19T16:30:00Z'); // 10 pm IST
const ago = (h) => new Date(now.getTime() - h * 3600000).toISOString();
const lead = (id, stage, h, course = null) => ({ id, name: id, stage, course, lastInboundAt: ago(h), quote: null });

test('story: waiting, going cold and win-back are split by age', () => {
  const s = buildHomeStory({
    now,
    waiting: [lead('a', 'engaged', 5), lead('b', 'new', 60), lead('c', 'high_intent', 80), lead('d', 'payment_pending', 100), lead('e', 'qualified', 30),
      lead('f', 'engaged', 200, 'x'), lead('g', 'engaged', 400), lead('h', 'high_intent', 900)],
    inboundTimes: [], leadsThisWeek: 137, leadsLastWeek: 341, lostSuggestions: 22, aiRepliesToday: 1,
  });
  assert.equal(s.waitingNow, 3);
  assert.equal(s.waitingThisWeek, 5);
  assert.deepEqual(s.goingCold.map((l) => l.id), ['d', 'c']); // paying first; 30-day cap drops h
  assert.deepEqual(s.winBack, { total: 3, withCourse: 1, withoutCourse: 2 });
  assert.equal(s.leadsChange, -60);
  assert.equal(s.headline, "3 people are waiting for a reply, and 2 interested leads haven't heard from you in over 2 days.");
});

test('story: calm headline and no fake baseline', () => {
  const s = buildHomeStory({ now, waiting: [], inboundTimes: [], leadsThisWeek: 5, leadsLastWeek: 3, lostSuggestions: 0, aiRepliesToday: 0 });
  assert.match(s.headline, /Everyone who wrote recently has a reply/);
  assert.equal(s.leadsChange, null);
});

test('story: hours in India time and the busiest window', () => {
  assert.equal(istHour('2026-11-19T08:45:00Z'), 14);
  const hours = new Array(24).fill(10); hours[14] = 100; hours[15] = 90; hours[16] = 80;
  assert.equal(busiestWindow(hours), '2 pm–5 pm');
  assert.equal(busiestWindow(new Array(24).fill(0)), null);
  assert.equal(waitedFor(ago(50), now), '2 days');
  assert.equal(waitedFor(ago(5), now), '5 hours');
});

test('story: funnel insight names the stall', () => {
  const g = groupHomePipelineStages({ new: 94, contacted: 2, engaged: 1080, qualified: 53, high_intent: 100, payment_pending: 13, enrolled: 1, not_now: 52 });
  assert.match(funnelInsight(g), /^80% of leads asked something \(usually the fee\) and went quiet; only 1 in 8 has said which course and when/);
  assert.equal(funnelInsight(groupHomePipelineStages({ new: 3, contacted: 0, engaged: 2, qualified: 0, high_intent: 0, payment_pending: 0 })), null);
});

test('story: says they paid, not asking how to pay', async () => {
  const { saysTheyPaid } = await import('../../lib/home-story.ts');
  for (const t of ['Payment made', 'I’ve made the payment', 'Yeah thank u. I have enrolled', 'Payment done mam', 'I paid the fee yesterday', 'Already paid']) assert.equal(saysTheyPaid(t), true, t);
  for (const t of ['How can I make the payment?', 'Can I pay in installments', 'I will make the payment tomorrow?', 'Where should I pay', 'I want to enrol', 'What is the course fee?']) assert.equal(saysTheyPaid(t), false, t);
});

test('story: paid leads lead the headline', () => {
  const s = buildHomeStory({ now, waiting: [lead('a', 'engaged', 5)], inboundTimes: [], leadsThisWeek: 1, leadsLastWeek: 1, lostSuggestions: 0, aiRepliesToday: 0,
    saysPaid: [{ id: 'p', name: 'p', stage: 'payment_pending', course: null, lastInboundAt: ago(300), quote: 'Payment made' }] });
  assert.equal(s.headline, "1 lead says they've paid but nothing is recorded, and 1 person is waiting for a reply.");
});
