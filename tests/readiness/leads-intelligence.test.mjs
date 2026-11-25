import { test } from 'node:test';
import assert from 'node:assert/strict';

import { courseTrends, headline, kpis, normalBand, suggestions, unusualRuns } from '../../lib/leads-intelligence.ts';

const day = (i, total, extra = {}) => ({ d: `2026-10-${String(i + 1).padStart(2, '0')}`, total, instagram: total, website: 0, other: 0, fromAd: 0, qualified: 0, ...extra });

function sample() {
  // 20 steady days around 40, then 3 high days mostly from an ad, then today.
  const daily = Array.from({ length: 20 }, (_, i) => day(i, 38 + (i % 5)));
  daily.push(day(20, 95, { fromAd: 80 }), day(21, 100, { fromAd: 85 }), day(22, 90, { fromAd: 70 }), day(23, 2));
  return {
    generatedAt: '', daily,
    weeks: [
      { wkAgo: 0, n: 290, qualified: 2, wrote: 270, replied: 70, medianReplyMin: 2 },
      { wkAgo: 1, n: 200, qualified: 36, wrote: 180, replied: 150, medianReplyMin: 13 },
      { wkAgo: 2, n: 360, qualified: 90, wrote: 340, replied: 310, medianReplyMin: 8 },
      { wkAgo: 3, n: 600, qualified: 180, wrote: 590, replied: 530, medianReplyMin: 7 },
      { wkAgo: 4, n: 170, qualified: 20, wrote: 165, replied: 110, medianReplyMin: 14 },
    ],
    replyEffect: { repliedN: 1000, repliedQ: 280, noneN: 300, noneQ: 36 },
    courses: [
      { name: '', courseId: null, w: [180, 120, 115, 153], n35: 600, q35: 20, openInr: null },
      { name: 'Sound Healing Level 1', courseId: 'a', w: [64, 65, 32, 12], n35: 190, q35: 99, openInr: 1080000 },
      { name: '200-Hour Yoga Teacher Training', courseId: 'b', w: [160, 55, 4, 33], n35: 298, q35: 107, openInr: 1980000 },
      { name: 'Online Face Yoga TTC', courseId: 'c', w: [56, 39, 9, 39], n35: 165, q35: 22, openInr: 400000 },
      { name: 'Tiny course', courseId: 'd', w: [1, 0, 0, 1], n35: 2, q35: 0, openInr: null },
    ],
    waiting: { n: 294, askedFee: 125, inWindow: 31 },
    pipeline: { n: 193, inr: 5305000 },
  };
}

test('a 3-day spike is one unusual run, credited to the ad, and today is never flagged', () => {
  const s = sample();
  const band = normalBand(s.daily);
  const runs = unusualRuns(s.daily, band);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].direction, 'high');
  assert.equal(runs[0].days, 3);
  assert.equal(runs[0].total, 285);
  assert.equal(runs[0].fromAd, 235);
  assert.equal(band.at(-1).flag === null || runs.every((r) => r.to !== band.at(-1).d), true);
});

test('suggestions are ranked and use real rates, never invented ones', () => {
  const ideas = suggestions(sample());
  assert.deepEqual(ideas.map((i) => i.key), ['reply', 'demand', 'unknown_course']);
  const reply = ideas[0];
  // 294 waiting × (28% − 12%) ≈ 47 more Qualified.
  assert.match(reply.impact, /≈ 47 MORE QUALIFIED/);
  assert.match(reply.body, /2\.3×/);
  const demand = ideas[1];
  assert.match(demand.title, /2 courses dropped/);
  assert.ok(demand.evidence.some((e) => e.label === 'Online Face Yoga TTC' && e.tone === 'good'));
});

test('kpis compare this week with the 3 weeks before', () => {
  const k = kpis(sample());
  assert.equal(k.newThisWeek, 2 + 90 + 100 + 95 + 42 + 41 + 40);
  assert.ok(k.newUsualWeek > 0);
  assert.equal(k.qualRate, 36 / 200);
  assert.deepEqual(k.qualEarlier, [20 / 170, 180 / 600]);
});

test('course trends hide tiny courses and keep "not known" last', () => {
  const t = courseTrends(sample());
  assert.equal(t.some((c) => c.name === 'Tiny course'), false);
  assert.equal(t.at(-1).known, false);
  assert.equal(t.find((c) => c.name === 'Sound Healing Level 1').usual, 54);
});

test('headline says fewer or more than usual, and who is waiting', () => {
  const text = headline(sample()).map((p) => p.text).join('');
  assert.match(text, /294 are waiting on our reply/);
});
