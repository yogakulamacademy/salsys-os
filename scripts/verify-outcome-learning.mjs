import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20261020103000_event_intelligence_outcome_learning_v1.sql';

function fail(message) {
  console.error(`\n[outcome-learning] FAIL: ${message}`);
  process.exit(1);
}

const absolute = path.join(root, migrationPath);
if (!fs.existsSync(absolute)) fail(`Missing required file: ${migrationPath}`);
const sql = fs.readFileSync(absolute, 'utf8');

const checks = [
  ['event_intelligence_outcome_horizon_v1', 'explicit outcome horizon policy'],
  ["when 'session_conversion_intent' then interval '30 days'", '30-day session conversion horizon'],
  ['observe_session_conversion_intent_outcomes_v1', 'session outcome observer'],
  ["authority_level='transactional'", 'transactional conversion authority requirement'],
  ["f.conversion_type in ('payment_success','enrollment_confirmed')", 'authoritative positive conversion types'],
  ["p.evidence ? 'feature_freshness'", 'freshness-contract learning boundary'],
  ['pg_advisory_xact_lock', 'tenant-scoped concurrent observer protection'],
  ["'matured_identity_unresolved'", 'unresolved identity accounting'],
  ["'anonymous_unresolved_sessions_are_not_forced_negative',true", 'no forced anonymous negative guardrail'],
  ['v_session_conversion_intent_outcome_dataset_v1', 'deduplicated realized outcome dataset'],
  ['v_session_conversion_intent_ranking_quality_v1', 'ranking quality bands'],
  ['v_session_conversion_intent_ranking_health_v1', 'ranking learning health'],
  ["false as calibrated_probability_claim", 'deterministic score non-probability disclosure'],
  ['v_event_intelligence_probability_calibration_health_v1', 'probability calibration health'],
  ['brier_score', 'Brier score measurement'],
  ['expected_calibration_error', 'expected calibration error measurement'],
  ["m.observed_predictions<50", 'minimum calibration sample guard'],
  ["m.positive_outcomes<10", 'minimum positive calibration class guard'],
  ["m.negative_outcomes<10", 'minimum negative calibration class guard'],
  ['v_event_intelligence_outcome_learning_health_v1', 'combined outcome-learning health'],
];

for (const [needle, label] of checks) {
  if (!sql.includes(needle)) fail(`Outcome-learning migration is missing ${label} (${needle}).`);
}

if (!sql.includes("'binary_outcome',1") || !sql.includes("'binary_outcome',0")) {
  fail('Outcome observer must encode a stable binary outcome for later ranking/calibration analysis.');
}

if (!sql.includes("if r.lead_id is null then")) {
  fail('Matured anonymous sessions must remain unlabeled when identity is unresolved.');
}

if (sql.includes("probability is null then 0")) {
  fail('Missing probability evidence must never be fabricated as zero.');
}

console.log('[outcome-learning] PASS: realized-outcome observation, conservative negative labeling, ranking learning, and probability calibration contracts verified.');
