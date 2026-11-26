import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreditStory, buildFunnelStory, creditLabel, isFunnelData } from '../../lib/marketing-funnel.ts';

const text = (parts) => parts.map((p) => p.text).join('');
const r = (channel, ft, lt, stage, n, o = {}) => ({ channel, ft, lt, stage, n, quiet: false, untouched: false, paid: 0, value: 0, currency: null, unowned: n, old: n, ...o });
const data = {
  days: 90,
  rows: [
    r('instagram', 'instagram', 'instagram', 'engaged', 965, { quiet: true }),
    r('instagram', 'instagram', 'instagram', 'engaged', 333),
    r('instagram', 'instagram', 'instagram', 'high_intent', 102),
    r('instagram', 'instagram', 'instagram', 'qualified', 66),
    r('instagram', 'instagram', 'instagram', 'not_now', 59),
    r('instagram', 'instagram', 'instagram', 'lost', 27),
    r('instagram', 'instagram', 'instagram', 'closed_won', 2, { paid: 2, value: 27500, currency: 'INR' }),
    r('instagram', 'instagram', 'website_backend', 'high_intent', 3),
    r('instagram', 'instagram', 'website_backend', 'closed_won', 1, { paid: 1, value: 20000, currency: 'INR' }),
    r('website', 'direct', 'direct', 'new', 33, { untouched: true, old: 31 }),
    r('website', 'www.google.com', 'www.google.com', 'new', 28, { untouched: true, old: 23 }),
    r('website', 'direct', 'website_backend', 'new', 16, { untouched: true }),
    r('website', 'chatgpt.com', 'chatgpt.com', 'new', 8, { untouched: true }),
    r('website', 'ig', 'ig', 'new', 9, { untouched: true }),
    r('website', 'direct', 'direct', 'qualified', 4),
    r('website', 'www.google.com', 'www.google.com', 'high_intent', 3),
    r('website', 'chatgpt.com', 'google', 'enrolled', 1),
    r('website', 'direct', 'direct', 'closed_won', 5, { paid: 5, value: 127500, currency: 'INR' }),
    r('website', 'direct', 'direct', 'engaged', 11),
  ],
  weeks: [
    { week: '2026-10-26', n: 592, qualified: 83 }, { week: '2026-11-02', n: 470, qualified: 72 },
    { week: '2026-11-09', n: 274, qualified: 27 }, { week: '2026-11-16', n: 228, qualified: 4 }, { week: '2026-11-23', n: 112, qualified: 1 },
  ],
};

test('funnel: steps, stuck stage and ranked actions', () => {
  assert.ok(isFunnelData(data));
  const s = buildFunnelStory(data);
  const all = s.groups[0];
  assert.deepEqual(all.steps, [1676, 1582, 187, 8]);
  assert.equal(all.stuck.label, 'Engaged');
  assert.deepEqual(s.groups.map((g) => g.key), ['all', 'instagram', 'website']);
  const web = s.groups.find((g) => g.key === 'website');
  assert.deepEqual(web.steps, [118, 24, 13, 5]);
  assert.match(text(s.headline), /^Of 1,676 enquiries in the last 90 days, 187 reached Qualified and 8 paid\. Website enquiries that someone answered did best: 5 of those 24 paid\. But 94 enquiries haven’t been answered at all, and almost everyone from Instagram is still sitting at “Engaged”\.$/);
  assert.deepEqual(s.ranks.map((x) => x.id), ['untouched', 'engaged', 'weeks']);
  assert.equal(s.ranks[1].title, 'Sort the 1,298 Instagram enquiries stuck at “Engaged”');
  assert.match(s.ranks[1].impact, /965 quiet for 7\+ days/);
  assert.equal(s.weeks.length, 5);
});

test('credit: first vs last touch, labels and signals', () => {
  const c = buildCreditStory(data);
  assert.equal(c.paidTotal, 175000);
  assert.equal(c.first[0].label, 'Website (typed the address)');
  assert.equal(c.first[0].value, 127500);
  assert.equal(c.first[1].label, 'Instagram');
  assert.equal(c.first[1].value, 47500);
  assert.equal(c.last.find((x) => x.label === 'Website form').value, 20000);
  assert.match(text(c.headline), /^The website gets the credit for ₹1,27,500 of the ₹1,75,000 paid so far, and Instagram for ₹47,500\./);
  assert.ok(c.signals.some((x) => x.id === 'hop'));
  assert.ok(c.signals.some((x) => x.id === 'typed'));
  assert.equal(creditLabel('com.google.android.googlequicksearchbox'), 'Google search');
  assert.equal(creditLabel('l.instagram.com'), 'Instagram link in bio');
});
