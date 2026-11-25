import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevenueStory, monthsFrom, revenueHeadline, rupees, isRevenueStoryData } from '../../lib/revenue-story.ts';

const data = {
  since: '2026-09-01',
  collected: [
    { month: '2026-09', course: 'Sound Healing', currency: 'INR', amount: 55000, payments: 1, people: 1 },
    { month: '2026-10', course: 'Face Yoga', currency: 'INR', amount: 20000, payments: 2, people: 2 },
    { month: '2026-10', course: 'Prenatal', currency: 'INR', amount: 45000, payments: 2, people: 2 },
    { month: '2026-11', course: 'Prenatal', currency: 'INR', amount: 55000, payments: 3, people: 3 },
  ],
  checkouts: [{ currency: 'INR', count: 6, amount: 55000 }, { currency: 'USD', count: 6, amount: 1996 }],
  paymentPending: 0,
  warm: [
    { stage: 'engaged', people: 1299, recent: 461, recentInr: 6165000, recentIntl: 5 },
    { stage: 'high_intent', people: 109, recent: 24, recentInr: 710000, recentIntl: 2 },
    { stage: 'qualified', people: 73, recent: 27, recentInr: 810000, recentIntl: 2 },
  ],
  enquiries: 1680,
  adSpend: [{ month: '2026-08', currency: 'INR', amount: 21185.65 }, { month: '2026-09', currency: 'INR', amount: 13034.3 }],
  adSpendLastDay: '2026-09-30',
};
const now = new Date('2026-11-25T12:00:00Z');

test('revenue story: only confirmed payments count, by month and course', () => {
  assert.ok(isRevenueStoryData(data));
  const s = buildRevenueStory(data, 92.7, now);
  assert.deepEqual(s.months.map((m) => [m.month, m.total]), [['2026-09', 55000], ['2026-10', 65000], ['2026-11', 55000]]);
  assert.equal(s.collectedInr, 175000);
  assert.equal(s.enrolments, 8);
  assert.equal(s.average, 21875);
  assert.equal(s.courses[0].course, 'Prenatal');
  assert.equal(s.courses[0].amount, 100000);
  assert.equal(s.thisMonthInr, 55000);
  assert.equal(s.lastMonthInr, 65000);
});

test('revenue story: checkouts, warm people and stale ad spend', () => {
  const s = buildRevenueStory(data, 92.7, now);
  assert.equal(s.checkouts.count, 12);
  assert.equal(Math.round(s.checkouts.inrTotal), Math.round(55000 + 1996 * 92.7));
  assert.deepEqual([s.warm.recent, s.warm.quiet, s.warm.valueInr, s.warm.intl], [51, 131, 1520000, 4]);
  assert.equal(s.spendStale, true);
  assert.deepEqual(s.spend.map((x) => x.amount === null ? null : Math.round(x.amount)), [21186, 13034, null, null]);
});

test('revenue story: headline and helpers', () => {
  const s = buildRevenueStory(data, 92.7, now);
  const text = revenueHeadline(s, data.since).map((p) => p.text).join('');
  assert.match(text, /^₹1\.75 L collected from 8 enrolments since September, ₹55,000 of it this month\./);
  assert.match(text, /12 website checkouts/);
  assert.match(text, /51 warm people/);
  assert.equal(rupees(1520000), '₹15.2 L');
  assert.equal(rupees(21875), '₹21,875');
  assert.deepEqual(monthsFrom('2026-09-01', now), ['2026-09', '2026-10', '2026-11']);
});
