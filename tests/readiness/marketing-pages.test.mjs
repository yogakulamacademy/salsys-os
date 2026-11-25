import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSourcesStory, buildAdsStory, isSourcesData, isAdsData, campaignLabel, googleErrorText } from '../../lib/marketing-pages.ts';
import { sourceLabel } from '../../lib/marketing-story.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/marketing-pages-yogakulam.json', import.meta.url), 'utf8'));
const text = (parts) => parts.map((p) => p.text).join('');

test('sources: untouched website enquiries come first, with the picked-up comparison', () => {
  assert.ok(isSourcesData(fx.sources));
  const s = buildSourcesStory(fx.sources, sourceLabel);
  assert.equal(s.total, 1668);
  assert.deepEqual(s.ranks.map((r) => r.id), ['untouched', 'quiet', 'search']);
  const u = s.ranks[0];
  assert.equal(u.title, 'Work the 100 website enquiries still at New');
  assert.equal(u.impact, '11 of 13 picked up turned warm');
  assert.match(text(u.body), /97 have no owner, and 94 follow-up tasks for them are overdue/);
  assert.match(text(s.headline), /^Instagram brings 93% of enquiries and 3 of the 5 enrolments\. Website enquiries are being left alone: 100 of 113/);
  assert.equal(s.ranks[1].impact, '1,294 stuck at Engaged');
  assert.match(text(s.ranks[2].body), /33 of 37 from Google search and 8 of 8 from ChatGPT/);
});

test('sources: rows merge raw sources into plain names', () => {
  const s = buildSourcesStory(fx.sources, sourceLabel);
  const google = s.rows.find((r) => r.label === 'Website · Google search');
  assert.deepEqual([google.n, google.untouched, google.warm], [37, 33, 3]);
  const ig = s.rows.find((r) => r.label === 'Website · Link from Instagram');
  assert.equal(ig.n, 11);
  assert.equal(s.kpis[3].value, '5');
});

test('ads: headline, Google error in plain words, blind weeks and signals', () => {
  assert.ok(isAdsData(fx.ads));
  const a = buildAdsStory(fx.ads, new Date('2026-11-25T15:00:00Z'));
  const all = a.views.all;
  assert.match(text(all.headline), /^₹63,899 was spent on ads between 11 Aug and 4 Oct \(Meta ₹34,220, Google ₹29,679\), and none of it can be traced to an enquiry\. Since 4 Oct/);
  assert.deepEqual(all.ranks.map((r) => r.id), ['google', 'meta', 'tagging']);
  assert.match(text(all.ranks[0].body), /hasn’t yet approved SalsysOS’s Google Ads API access/);
  assert.equal(all.ranks[0].impact, 'Failing every day since 7 Oct');
  assert.equal(a.blindFrom, '2026-10-05');
  assert.equal(a.weeks.find((w) => w.week === '2026-09-28').google, 17.42);
  assert.deepEqual(all.signals.map((s) => s.id), ['pricey', 'blind', 'leadform', 'best']);
  assert.match(all.signals[0].title, /7× more than Instagram/);
  assert.equal(all.kpis[3].value, '₹17');
  assert.deepEqual(a.views.meta.ranks.map((r) => r.id), ['meta', 'tagging']);
  assert.ok(!a.views.google.signals.some((s) => s.id === 'best'));
});

test('ads: helpers', () => {
  assert.equal(campaignLabel('Instagram post: 🌸 85-Hour Online Prenatal...'), 'Boosted post: 85-Hour Online Prenatal...');
  assert.match(googleErrorText('UNAUTHENTICATED'), /expired/);
  assert.equal(googleErrorText(''), null);
});
