import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_COMPARABLE_BASELINE,
  buildHomeInsights,
  buildLocationBreakdown,
  changeChip,
  comparableChange,
  normalizeCountry,
  percentOf,
  sparklinePoints,
} from '../../lib/home-command-center.ts';

test('period change is hidden when the earlier period has no meaningful baseline', () => {
  // Production 30D: 1,343 leads against 10 before Instagram was connected.
  assert.equal(comparableChange(1343, 10), null);
  assert.deepEqual(changeChip(1343, 10), { text: 'No baseline yet', tone: 'flat' });
  assert.equal(comparableChange(226, 432), -48);
  assert.deepEqual(changeChip(226, 432), { text: '▼ 48% vs previous', tone: 'down' });
  assert.deepEqual(changeChip(60, 40), { text: '▲ 50% vs previous', tone: 'up' });
  assert.equal(comparableChange(5, MIN_COMPARABLE_BASELINE - 1), null);
  assert.equal(comparableChange(null, 100), null);
  assert.equal(comparableChange(Number.NaN, 100), null);
});

test('free-text locations normalise to countries, including Indian cities and states', () => {
  for (const raw of ['India', 'IN', 'india', 'IND', 'Pune', 'Odisha', 'Idukki ,kerala']) {
    assert.equal(normalizeCountry(raw), 'India', raw);
  }
  for (const raw of ['United States', 'US', 'USA']) assert.equal(normalizeCountry(raw), 'United States', raw);
  for (const raw of ['GB', 'Uk']) assert.equal(normalizeCountry(raw), 'United Kingdom', raw);
  assert.equal(normalizeCountry('CA'), 'Canada');
  assert.equal(normalizeCountry('United Arab Emirates'), 'United Arab Emirates');
  assert.equal(normalizeCountry('Atlantis'), null);
  assert.equal(normalizeCountry(''), null);
  assert.equal(normalizeCountry(null), null);
});

test('location breakdown counts recognised countries and never guesses unknown text', () => {
  const values = ['India', 'IN', 'Pune', 'US', 'USA', 'GB', 'Atlantis', '', null, undefined, 'Croatia'];
  const breakdown = buildLocationBreakdown(values);
  assert.equal(breakdown.total, 11);
  assert.equal(breakdown.filled, 8);
  assert.equal(breakdown.recognised, 7);
  assert.deepEqual(breakdown.rows.map((row) => [row.name, row.leads]), [
    ['India', 3], ['United States', 2], ['Croatia', 1], ['United Kingdom', 1],
  ]);
  const india = breakdown.rows[0];
  assert.ok(india.lon > 60 && india.lon < 100 && india.lat > 5 && india.lat < 35);
});

test('insights describe volume versus quality only from reconciled source rows', () => {
  const sources = [
    { source: 'Instagram', leads: 1268, qualified: 0 },
    { source: 'Direct', leads: 52, qualified: 5 },
    { source: 'Google', leads: 25, qualified: 4 },
    { source: 'ChatGPT', leads: 6, qualified: 1 },
  ];
  const insights = buildHomeInsights({ sources, currentLeads: 226, previousLeads: 432 });
  assert.deepEqual(insights.map((item) => item.id), ['volume-vs-quality', 'best-source', 'lead-trend']);
  assert.equal(insights[0].title, 'Instagram brings volume, not qualification');
  assert.equal(insights[0].value, '0%');
  assert.equal(insights[1].title, 'ChatGPT leads qualify best');
  assert.equal(insights[1].value, '17%');
  assert.equal(insights[2].value, '-48%');

  // No reconciled sources and no baseline: no claims at all.
  assert.deepEqual(buildHomeInsights({ sources: null, currentLeads: 1343, previousLeads: 10 }), []);
  // Sources under the minimum size never become "best".
  assert.deepEqual(buildHomeInsights({ sources: [{ source: 'Tiny', leads: 2, qualified: 2 }], currentLeads: null, previousLeads: null }), []);
  // Malformed rows are ignored rather than trusted.
  assert.deepEqual(buildHomeInsights({ sources: [{ source: 'Bad', leads: 10, qualified: 11 }], currentLeads: null, previousLeads: null }), []);
});

test('sparklines and percentages are safe for empty or invalid input', () => {
  const flat = sparklinePoints([], 110, 44);
  assert.ok(flat.line.length > 0 && flat.area.startsWith('0,44'));
  const spark = sparklinePoints([0, 5, -3, Number.NaN, 10], 100, 40);
  assert.equal(spark.line.split(' ').length, 5);
  assert.ok(!spark.line.includes('NaN'));
  assert.equal(percentOf(97, 1354), '7%');
  assert.equal(percentOf(1, 0), '—');
});
