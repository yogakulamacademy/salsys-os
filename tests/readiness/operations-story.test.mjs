import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOpsStory, opsWindow, isOpsData, courseLabel } from '../../lib/operations-story.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/operations-story-yogakulam.json', import.meta.url), 'utf8'));
const text = (parts) => parts.map((p) => p.text).join('');

test('operations: next batch to fill, students without a batch, seats', () => {
  assert.ok(isOpsData(fx));
  const s = buildOpsStory(fx);
  assert.deepEqual(s.ranks.map((r) => r.id), ['fill', 'assign', 'seats']);
  assert.equal(s.ranks[0].title, 'Fill the 85-Hour Prenatal & Postnatal TTC batch in Mysore');
  assert.equal(s.ranks[0].impact, 'Starts in 5 days · 53 warm');
  assert.equal(s.ranks[1].title, 'Put the 8 paid students into a batch');
  assert.match(text(s.headline), /^17 batches start in the next 30 days, and the next big one, 85-Hour Prenatal & Postnatal TTC in Mysore on 1 Dec, has 53 warm people interested but nobody enrolled yet\. 8 people have paid but none is assigned to a batch, and no batch has a seat count/);
});

test('operations: signals and windows', () => {
  const s = buildOpsStory(fx);
  assert.deepEqual(s.signals.map((x) => x.id), ['nodemand', 'twin', 'price']);
  assert.match(s.signals[0].title, /^4 batches in the next 30 days have nobody warm asking/);
  assert.match(s.signals[1].summary, /Kerala \(27 warm\) and Mysore \(41 warm\)/);
  assert.equal(opsWindow(s, 30).rows.length, 17);
  assert.equal(opsWindow(s, 14, 'online').rows.length, 1);
  assert.equal(opsWindow(s, 30).kpis[2].badge.text, '8 without a batch');
  assert.equal(courseLabel('200-Hour Yoga Teacher Training'), '200-Hour YTT');
});
