import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMarketingStory, isMarketingStoryData, sourceLabel, shortCourse } from '../../lib/marketing-story.ts';

const data = JSON.parse(readFileSync(new URL('./fixtures/marketing-story-yogakulam.json', import.meta.url), 'utf8'));
const form = { viewed: 628, started: 63, submitted: 37 };
const now = new Date('2026-11-25T14:00:00Z');
const text = (parts) => parts.map((p) => p.text).join('');

test('marketing story: filters, import week and the trend', () => {
  assert.ok(isMarketingStoryData(data));
  const s = buildMarketingStory(data, form, now);
  assert.deepEqual(s.filters, ['all', 'instagram', 'website']);
  const all = s.views.all;
  assert.deepEqual(all.weeks.map((w) => [w.week, w.total, w.imported, w.partial]), [
    ['2026-10-26', 592, 'instagram', false], ['2026-11-02', 470, null, false], ['2026-11-09', 274, null, false],
    ['2026-11-16', 228, null, false], ['2026-11-23', 105, null, true]]);
  assert.match(text(all.headline), /^New enquiries have halved since the week of 2 Nov \(470 → 228 a week\), and the whole drop is Instagram; website is steady\./);
  assert.equal(all.kpis[0].value, '228');
  assert.equal(all.kpis[0].badge.text, '▼ 51%');
});

test('marketing story: unanswered people come first, with an honest estimate', () => {
  const s = buildMarketingStory(data, form, now);
  const ig = s.views.instagram;
  assert.equal(ig.ranks[0].id, 'no-reply');
  assert.equal(ig.ranks[0].title, 'Answer the 278 people nobody replied to');
  assert.equal(ig.ranks[0].impact, '≈ 24 more warm people');
  assert.match(text(ig.ranks[0].body), /3\.2 times as often/);
  // Website replies happen outside the CRM, so website has no reply-speed chart or no-reply card.
  const web = s.views.website;
  assert.equal(web.speed, null);
  assert.ok(!web.ranks.some((r) => r.id === 'no-reply'));
});

test('marketing story: website view finds the Face Yoga gap and the form leak', () => {
  const web = buildMarketingStory(data, form, now).views.website;
  assert.deepEqual(web.ranks.map((r) => r.id), ['course-gap', 'form', 'ads']);
  assert.equal(web.ranks[0].title, 'Check the Online Face Yoga TTC page');
  assert.equal(web.kpis[2].label, 'Form finished');
  assert.ok(web.signals.some((x) => x.id === 'ai' && /7 enquiries/.test(x.summary) && /2 in October and 1 in September/.test(x.summary)));
});

test('marketing story: ads, topics and signals in the All view', () => {
  const all = buildMarketingStory(data, form, now).views.all;
  assert.deepEqual(all.ranks.map((r) => r.id), ['no-reply', 'topics', 'ads']);
  const ads = all.ranks[2];
  assert.equal(ads.title, 'Reconnect Meta and Google Ads');
  assert.equal(ads.impact, '0 of 1,666 linked to an ad');
  assert.match(text(ads.body), /whether the Instagram drop is because ads stopped/);
  assert.match(all.ranks[1].impact, /^Instagram ▼ 55% since 2 Nov$/);
  assert.deepEqual(all.signals.map((x) => x.id), ['ai', 'form', 'no-course', 'gap-website', 'country']);
});

test('marketing story: plain source names', () => {
  assert.equal(sourceLabel('www.google.com', 'website'), 'Website · Google search');
  assert.equal(sourceLabel('chatgpt.com', 'website'), 'Website · ChatGPT');
  assert.equal(sourceLabel('instagram', 'instagram'), 'Instagram messages');
  assert.equal(sourceLabel('ig', 'website'), 'Website · Link from Instagram');
  assert.equal(sourceLabel('direct', 'website'), 'Website · Typed the address / unknown');
  assert.equal(shortCourse('85-Hour Prenatal & Postnatal Yoga TTC'), '85-Hr Prenatal TTC');
});
