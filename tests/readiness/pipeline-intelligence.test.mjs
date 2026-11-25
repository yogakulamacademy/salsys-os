import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coolingCell, heatGrid, inrText, pipelineSuggestions } from '../../lib/pipeline-intelligence.ts';

const sample = () => ({
  generatedAt: '',
  stages: { qualified: 69, high_intent: 110, payment_pending: 14 },
  cells: [
    { stage: 'high_intent', bucket: 'd0_2', n: 27, waiting: 13, inr: 1140000, topCourse: '200-Hour Yoga Teacher Training' },
    { stage: 'high_intent', bucket: 'd15_30', n: 71, waiting: 15, inr: 1945000, topCourse: '85-Hour Prenatal & Postnatal Yoga TTC' },
    { stage: 'high_intent', bucket: 'd8_14', n: 12, waiting: 3, inr: 155000, topCourse: 'Online Prenatal & Postnatal TTC' },
    { stage: 'payment_pending', bucket: 'd0_2', n: 1, waiting: 1, inr: 25000, topCourse: null },
    { stage: 'payment_pending', bucket: 'd15_30', n: 3, waiting: 1, inr: 55000, topCourse: null },
    { stage: 'payment_pending', bucket: 'd3_7', n: 1, waiting: 0, inr: 0, topCourse: null },
    { stage: 'payment_pending', bucket: 'd30', n: 8, waiting: 8, inr: 90000, topCourse: null },
    { stage: 'payment_pending', bucket: 'none', n: 1, waiting: 0, inr: 0, topCourse: null },
    { stage: 'qualified', bucket: 'd15_30', n: 38, waiting: 7, inr: 965000, topCourse: '85-Hour Prenatal & Postnatal Yoga TTC' },
  ],
  highIntentWaiting: { n: 31, inr: 855000, medianDays: 13.7 },
  payment: { n: 14, monthPlus: 9, inr: 170000 },
  moves30: { highIntentToPayment: 1, toPayment: 6, won: 2 },
  open: { n: 193, inr: 5305000, priced: 154 },
  courses: [],
});

test('heat grid is 3 stages × 5 buckets and folds "no messages" into 30+ days', () => {
  const g = heatGrid(sample());
  assert.equal(g.length, 3);
  assert.equal(g[0].length, 5);
  assert.equal(g[2][4].n, 9);
  assert.equal(g[1][3].n, 71);
});

test('the cooling note points at the biggest quiet cell', () => {
  const c = coolingCell(heatGrid(sample()));
  assert.equal(c.stage, 'high_intent');
  assert.equal(c.bucket, 'd15_30');
  assert.equal(c.waiting, 15);
});

test('suggestions use the real counts and never invent a rate', () => {
  const s = pipelineSuggestions(sample());
  assert.deepEqual(s.map((x) => x.key), ['high_intent_waiting', 'payment_stale', 'stuck_step']);
  assert.match(s[0].impact, /8\.6 LAKH/);
  assert.match(s[0].body, /median of 14 days/);
  assert.deepEqual(s[1].evidence.map((e) => e.value), [2, 3, 9]);
  assert.match(s[2].title, /110 at High intent, 1 moved/);
});

test('rupee text', () => {
  assert.equal(inrText(5305000), '₹53 lakh');
  assert.equal(inrText(855000), '₹8.6 lakh');
  assert.equal(inrText(90000), '₹90,000');
  assert.equal(inrText(100000), '₹1 lakh');
});

test('an incomplete summary is rejected so the page falls back', async () => {
  const { isPipelineIntelligence } = await import('../../lib/pipeline-intelligence.ts');
  assert.equal(isPipelineIntelligence({}), false);
  assert.equal(isPipelineIntelligence(null), false);
  assert.equal(isPipelineIntelligence(sample()), true);
});
