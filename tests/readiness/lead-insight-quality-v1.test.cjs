const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { summarizeInsightReviews } = load('lib/ai/lead-insight-quality.ts');

test('unreviewed set reports no false accuracy percentage', () => {
  const summary = summarizeInsightReviews([]);
  assert.equal(summary.staffPositiveRate, null);
  assert.equal(summary.reviewCount, 0);
  assert.match(summary.caveat, /not a calibrated measure/);
});

test('quality summary excludes unsure from staff positive rate denominator', () => {
  const summary = summarizeInsightReviews([
    {run_id: 'a', rating:'accurate', issue_codes:[]},
    {run_id: 'b', rating:'partially_accurate', issue_codes:['missing_context']},
    {run_id: 'b', rating:'inaccurate', issue_codes:['wrong_intent','wrong_intent']},
    {run_id: 'c', rating:'unsure', issue_codes:[]},
  ]);
  assert.equal(summary.reviewCount, 4);
  assert.equal(summary.distinctRunsReviewed, 3);
  assert.equal(summary.staffPositiveRate, 66.7);
  assert.equal(summary.issueCounts.missing_context, 1);
  assert.equal(summary.issueCounts.wrong_intent, 1);
  assert.equal(summary.ratedUnsure, 1);
});
