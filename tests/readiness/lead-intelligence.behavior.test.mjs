import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildLeadIntelligence, formatAgo, intentFor, readSignals } from '../../lib/lead-intelligence.ts';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const ago = (mins) => new Date(NOW - mins * 60_000).toISOString();

test('signals come only from what the lead wrote', () => {
  const r = readSignals([
    { direction: 'outbound', body: 'Our fees are on the website', timestamp: ago(10) },
    { direction: 'inbound', body: 'When is the next batch? I want to register', timestamp: ago(5) },
  ]);
  assert.deepEqual(r.labels, ['Asked about dates', 'Wants to apply']);
  assert.equal(r.score, 4);
});

test('intent levels and stage override', () => {
  assert.equal(intentFor(0, 'new').level, 'hello');
  assert.equal(intentFor(1, 'new').level, 'curious');
  assert.equal(intentFor(2, 'new').level, 'warm');
  assert.equal(intentFor(4, 'new').level, 'high');
  assert.equal(intentFor(0, 'payment_pending').level, 'high');
});

test('waiting on us for over a day is going cold and is flagged first', () => {
  const intel = buildLeadIntelligence({
    stage: 'contacted',
    messages: [
      { direction: 'outbound', body: 'Hi!', timestamp: ago(3000), sender: 'Admissions' },
      { direction: 'inbound', body: 'How much is the 200 hour course?', timestamp: ago(2000) },
    ],
    course: '200 Hour YTT',
    ownerName: null,
    createdAt: ago(4000),
    originLabel: 'instagram',
    waitingSince: ago(2000),
    needsReply: true,
    now: NOW,
  });
  assert.equal(intel.stats.health, 'going_cold');
  assert.equal(intel.stats.waitText, '1d');
  assert.equal(intel.stats.inbound, 1);
  assert.equal(intel.stats.outbound, 1);
  assert.equal(intel.timeline[0].tone, 'warn');
  assert.match(intel.summary, /^Contacted lead · asked about price · 200 Hour YTT\. Waiting 1d for our reply\. No owner yet\.$/);
  assert.equal(intel.journey.stages.find((s) => s.state === 'current').key, 'contacted');
  assert.equal(intel.journey.stepText, 'Contacted · step 2 of 7');
});

test('ball with them when we replied last', () => {
  const intel = buildLeadIntelligence({
    stage: 'engaged',
    messages: [
      { direction: 'inbound', body: 'hello', timestamp: ago(90) },
      { direction: 'outbound', body: 'Hi, how can we help?', timestamp: ago(30) },
    ],
    ownerName: 'Asha',
    now: NOW,
  });
  assert.equal(intel.stats.health, 'waiting_on_them');
  assert.equal(intel.stats.waitLabel, 'Since last message');
  assert.match(intel.summary, /We replied; waiting on them\.$/);
  assert.equal(intel.intent, 'hello');
});

test('off-track stages show no current step', () => {
  const intel = buildLeadIntelligence({ stage: 'lost', messages: [], ownerName: 'A', now: NOW });
  assert.equal(intel.journey.offTrack, 'Lost');
  assert.ok(intel.journey.stages.every((s) => s.state === 'todo'));
  assert.match(intel.journey.stepText, /Off the journey/);
});

test('timeline is newest first, merges CRM history, skips duplicated message touchpoints, collapses reply runs', () => {
  const intel = buildLeadIntelligence({
    stage: 'qualified',
    messages: [
      { direction: 'inbound', body: 'I want to join the Kerala course', timestamp: ago(500) },
      { direction: 'outbound', body: 'a', timestamp: ago(400), sender: 'Admissions' },
      { direction: 'outbound', body: 'b', timestamp: ago(300), sender: 'Admissions' },
      { direction: 'outbound', body: 'c', timestamp: ago(200), sender: 'Admissions' },
    ],
    touchpoints: [
      { label: 'Moved to qualified', timestamp: ago(100), kind: 'stage', source: 'CRM' },
      { label: 'message received', timestamp: ago(500), kind: 'message' },
    ],
    createdAt: ago(600),
    ownerName: 'A',
    now: NOW,
  });
  const texts = intel.timeline.map((t) => t.text);
  assert.deepEqual(texts, ['Moved to qualified', 'Team replied ×3', 'Lead: I want to join the Kerala course', 'Lead created']);
  assert.equal(intel.timeline[0].when, '1h ago');
});

test('long lead messages are clipped in the timeline', () => {
  const intel = buildLeadIntelligence({
    stage: 'new',
    messages: [{ direction: 'inbound', body: 'x'.repeat(200), timestamp: ago(1) }],
    ownerName: 'A',
    now: NOW,
  });
  assert.ok(intel.timeline[0].text.length <= 6 + 48);
  assert.ok(intel.timeline[0].text.endsWith('…'));
});

test('formatAgo units', () => {
  assert.equal(formatAgo(NOW - 30_000, NOW), 'just now');
  assert.equal(formatAgo(NOW - 45 * 60_000, NOW), '45m');
  assert.equal(formatAgo(NOW - 5 * 3_600_000, NOW), '5h');
  assert.equal(formatAgo(NOW - 3 * 86_400_000, NOW), '3d');
});

test('inbox page renders the card from server data only', () => {
  const page = readFileSync(new URL('../../app/conversations/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /buildLeadIntelligence\(/);
  assert.match(page, /<InboxLeadIntelligence intel=\{leadIntel\} \/>/);
  const card = readFileSync(new URL('../../components/inbox-lead-intelligence.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(card, /"use client"/);
});
