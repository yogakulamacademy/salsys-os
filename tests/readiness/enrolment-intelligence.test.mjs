import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanAdTitle, dataLayers, groupAdsByCreative, MIN_SIGNAL_SAMPLE, rankSignals } from '../../lib/enrolment-intelligence.ts';

test('signals are ranked by rate against everyone, small samples last', () => {
  const { baseline, ranked } = rankSignals([
    { key: 'all', label: 'Everyone', n: 1000, payN: 12, hiN: 90 },
    { key: 'fee', label: 'Asked the fee', n: 600, payN: 3, hiN: 60 },
    { key: 'web', label: 'Visited the website', n: 100, payN: 11, hiN: 18 },
    { key: 'tiny', label: 'Rare', n: MIN_SIGNAL_SAMPLE - 1, payN: 5, hiN: 5 },
  ]);
  assert.equal(baseline.rate, 0.012);
  assert.deepEqual(ranked.map((s) => s.key), ['web', 'fee', 'tiny']);
  assert.ok(Math.abs(ranked[0].lift - 0.11 / 0.012) < 1e-9);
  assert.ok(ranked[1].lift < 1);
  assert.equal(ranked[2].reliable, false);
});

test('no baseline means no lift, never a division by zero', () => {
  const { ranked } = rankSignals([{ key: 'all', label: 'Everyone', n: 10, payN: 0, hiN: 0 }, { key: 'web', label: 'Web', n: 40, payN: 0, hiN: 0 }]);
  assert.equal(ranked[0].lift, null);
});

test('ad titles lose the Meta prefix and ad-set suffix', () => {
  assert.equal(cleanAdTitle('Instagram post: ✨ Face Yoga Teacher Training..._Group_1'), '✨ Face Yoga Teacher Training…');
  assert.equal(cleanAdTitle(null), 'Untitled ad');
});

test('the same creative in several ad sets is counted once', () => {
  const g = groupAdsByCreative([
    { adId: '1', title: 'Instagram post: What if just 24 days could..._Group_1', people: 121, qualified: 40, highIntent: 10, payment: 0, firstSeen: '2026-10-26', lastSeen: '2026-11-20' },
    { adId: '2', title: 'Instagram post: What if just 24 days could...', people: 28, qualified: 5, highIntent: 2, payment: 0, firstSeen: '2026-11-21', lastSeen: '2026-11-23' },
    { adId: '3', title: 'Instagram post: ✨ Face Yoga Teacher Training...', people: 50, qualified: 6, highIntent: 5, payment: 0, firstSeen: null, lastSeen: null },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].people, 149);
  assert.deepEqual(g[0].adIds, ['1', '2']);
  assert.equal(g[0].lastSeen, '2026-11-23');
});

test('data layers flag the missing outcome and stale ad spend', () => {
  const layers = dataLayers({
    generatedAt: '', days: 60,
    outcomes: { reachedPayment: 17, wonOrEnrolled: 3, paymentPendingNow: 14, paymentRecords: 24, paymentsPaid: 0, enrollments: 0 },
    journey: { byChannel: {}, movedBy: {}, medianMessagesDm: null, websiteShareOfPeople: null },
    signals: [], ads: [],
    layers: { people: 1665, conversation: 1571, ad: 802, website: 122, linkVisits: 9, country: 129, callsLogged: 36, adSpendLastDay: '2026-09-30' },
  }, new Date('2026-11-25'));
  const by = Object.fromEntries(layers.map((l) => [l.key, l]));
  assert.equal(layers.length, 10);
  assert.equal(by.outcome.status, 'gap');
  assert.equal(by.spend.status, 'gap');
  assert.equal(by.ad.status, 'live');
  assert.ok(by.ad.coverage > 0.48 && by.ad.coverage < 0.49);
});
