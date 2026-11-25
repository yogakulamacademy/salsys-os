import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWebStory, buildSearchStory, buildTrackingStory, webSourceGroup, pageLabel, isWebData, isSearchData, isTrackingData } from '../../lib/marketing-web.ts';
import { googleErrorText } from '../../lib/marketing-pages.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/marketing-web-yogakulam.json', import.meta.url), 'utf8'));
const text = (parts) => parts.map((p) => p.text).join('');

test('website: Mysore vs Kerala page gap, form, AI assistants', () => {
  assert.ok(isWebData(fx.web));
  const w = buildWebStory(fx.web, { started: 63, submitted: 37 });
  assert.deepEqual(w.ranks.map((r) => r.id), ['page', 'form', 'ai']);
  assert.equal(w.ranks[0].title, 'Fix the 200-Hour YTT in Mysore page');
  assert.match(text(w.ranks[0].body), /200-Hour YTT in Kerala turns 12 in 100 visits/);
  assert.match(text(w.headline), /^3,289 visits in the last 30 days, 17% fewer than the 30 days before; about 1 in 29 visits becomes an enquiry\./);
  const ai = w.sources.find((s) => s.label.startsWith('AI assistants'));
  assert.deepEqual([ai.visits, ai.leads], [144, 8]);
  assert.equal(w.kpis[3].label, 'From outside India');
  assert.ok(w.signals.some((s) => s.title === 'All courses list gets visits but no enquiries'));
});

test('search: titles on page 1, buried page, page-2 page', () => {
  assert.ok(isSearchData(fx.search));
  const s = buildSearchStory(fx.search);
  assert.deepEqual(s.ranks.map((r) => r.id), ['titles', 'buried', 'page2']);
  assert.equal(s.ranks[0].title, 'Rewrite the titles for 3 searches already on page 1');
  assert.equal(s.ranks[1].title, 'Lift the Online 200-Hour YTT page');
  assert.equal(s.ranks[2].title, 'Push the Online Prenatal Yoga TTC page onto page 1');
  assert.match(text(s.headline), /880 clicks in the last 30 days \(6% fewer\), while you appeared in 9% more searches; 29% of clicks are people searching your name/);
});

test('tracking: 5 of 8 working, the Google approval explained', () => {
  assert.ok(isTrackingData(fx.tracking));
  const t = buildTrackingStory(fx.tracking, googleErrorText, new Date('2026-11-25T17:30:00Z'));
  assert.deepEqual(t.items.map((i) => [i.key, i.status]), [['web', 'ok'], ['forms', 'ok'], ['ig', 'ok'], ['ga4', 'ok'], ['gsc', 'ok'], ['wa', 'warn'], ['meta', 'bad'], ['gads', 'bad']]);
  assert.match(text(t.headline), /^5 of 8 connections are working/);
  assert.match(text(t.headline), /Meta Ads and Google Ads are not working, WhatsApp has been quiet, and almost no visit carries a campaign tag\./);
  assert.match(t.items[7].todo, /Google Ads API approval/);
  assert.deepEqual(t.cards.map((c) => c.id), ['tags', 'matched', 'unused']);
});

test('helpers', () => {
  assert.equal(webSourceGroup('google', 'organic'), 'Google search');
  assert.equal(webSourceGroup('www.google.com'), 'Google search');
  assert.equal(webSourceGroup('google', 'cpc'), 'Google Ads');
  assert.equal(webSourceGroup('(direct)', '(none)'), 'Typed the address / unknown');
  assert.equal(pageLabel('/courses/online/online-face-yoga-teacher-training.php'), 'Online Face Yoga TTC');
  assert.equal(pageLabel(''), 'Home page');
});
