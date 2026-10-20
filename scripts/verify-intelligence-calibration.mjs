import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20261020101500_event_intelligence_outcome_calibration_v1.sql';
const privacyGuardPath = 'supabase/migrations/20261020101600_event_intelligence_calibration_privacy_guard_v1.sql';
const deterministicPath = 'supabase/migrations/20261019143000_event_intelligence_deterministic_predictions_v1.sql';
const observerRoutePath = 'app/api/intelligence/prediction-outcomes/route.ts';
const vercelPath = 'vercel.json';

function fail(message) {
  console.error(`\n[intelligence-calibration] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const sql = read(migrationPath);
const privacyGuard = read(privacyGuardPath);
const deterministic = read(deterministicPath);
const observerRoute = read(observerRoutePath);
const vercel = read(vercelPath);

for (const [needle, label] of [
  ['observe_event_intelligence_lead_outcomes_v1', 'realized-outcome observer'],
  ['lead_conversion_resolution_v1', 'idempotent outcome contract'],
  ['v_lead_conversion_facts', 'canonical conversion fact source'],
  ["h.to_stage::text in ('lost','unqualified')", 'terminal negative outcome source'],
  ["'first_authoritative_sales_resolution_after_prediction'", 'explicit target definition'],
  ['profiling_allowed', 'privacy-aware outcome observation'],
  ["'predictions_mutated',false", 'immutable prediction audit contract'],
  ['v_event_intelligence_probability_evaluation_v1', 'probability evaluation view'],
  ["p.probability is not null", 'true probability-only evaluation guard'],
  ['squared_error', 'Brier-score component'],
  ['log_loss', 'probabilistic log-loss metric'],
  ['v_event_intelligence_calibration_bins_v1', 'calibration bins'],
  ['calibration_gap', 'calibration gap metric'],
  ['v_event_intelligence_probability_health_v1', 'calibration health view'],
  ['expected_calibration_error', 'expected calibration error'],
  ['minimum_observed_for_calibration_claim', 'minimum sample gate'],
  ['minimum_positive_outcomes', 'positive-class sample gate'],
  ['minimum_negative_outcomes', 'negative-class sample gate'],
  ['calibration_ready', 'calibration readiness flag'],
  ["'collecting_outcomes'", 'no-outcome status'],
  ["'directional_only'", 'small-sample status'],
  ['v_event_intelligence_probability_drift_v1', 'probability drift view'],
  ['population_stability_index', 'PSI distribution-shift metric'],
  ["'insufficient_sample'", 'drift sample gate'],
  ["'material_shift'", 'drift warning state'],
  ['does not prove model accuracy or causality', 'drift interpretation guard'],
]) {
  if (!sql.includes(needle)) fail(`Outcome/calibration migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['v_event_intelligence_probability_evaluation_v1', 'guarded evaluation replacement'],
  ['v_r10_lead_signal_quality_v1', 'current signal-quality source'],
  ['q.profiling_allowed=true', 'current profiling permission gate'],
  ["p.subject_type='lead'", 'lead-only probability scope'],
]) {
  if (!privacyGuard.includes(needle)) fail(`Calibration privacy guard is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['SYSTEM_INTELLIGENCE_SYNC_SECRET', 'system-intelligence authorization'],
  ['CRON_SECRET', 'cron authorization'],
  [".rpc(\n        'observe_event_intelligence_lead_outcomes_v1'", 'scheduled outcome observer RPC'],
  ['authoritative_business_outcomes_only: true', 'authoritative outcome guardrail'],
  ['unresolved_predictions_remain_unresolved: true', 'unresolved-outcome guardrail'],
  ['prediction_values_are_not_mutated: true', 'immutable prediction guardrail'],
  ['privacy_profiling_gate_is_enforced_by_observer: true', 'privacy observer guardrail'],
  ['probability_generation_is_not_performed_here: true', 'observer/generation separation'],
]) {
  if (!observerRoute.includes(needle)) fail(`Scheduled outcome observer is missing ${label} (${needle}).`);
}

if (!vercel.includes('"path": "/api/intelligence/prediction-outcomes"')) {
  fail('Vercel cron must schedule the prediction outcome observer.');
}
if (!vercel.includes('"schedule": "40 */6 * * *"')) {
  fail('Prediction outcome observer must keep the controlled six-hour cadence.');
}

if (sql.includes('score as probability') || sql.includes('p.score as probability')) {
  fail('Deterministic ranking score must never be silently converted into a probability.');
}

if (!deterministic.includes("'calibrated_probability',false")) {
  fail('Deterministic prediction families must remain explicitly non-probabilistic.');
}

if (!sql.includes('Metrics are observational only; sample is too small for an accuracy claim.')) {
  fail('Small samples must not be presented as validated model accuracy.');
}

console.log('[intelligence-calibration] PASS: authoritative realized outcomes, current privacy gates, scheduled observation, probability-only evaluation, sample-gated calibration, and drift contracts verified.');
