import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20261020101500_event_intelligence_outcome_calibration_v1.sql';
const deterministicPath = 'supabase/migrations/20261019143000_event_intelligence_deterministic_predictions_v1.sql';

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
const deterministic = read(deterministicPath);

for (const [needle, label] of [
  ['observe_event_intelligence_lead_outcomes_v1', 'realized-outcome observer'],
  ['lead_conversion_resolution_v1', 'idempotent outcome contract'],
  ['v_lead_conversion_facts', 'canonical conversion fact source'],
  ["h.to_stage::text in ('lost','unqualified')", 'terminal negative outcome source'],
  ["'first_authoritative_sales_resolution_after_prediction'", 'explicit target definition'],
  ['profiling_allowed', 'privacy-aware outcome evaluation'],
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

if (sql.includes('score as probability') || sql.includes('p.score as probability')) {
  fail('Deterministic ranking score must never be silently converted into a probability.');
}

if (!deterministic.includes("'calibrated_probability',false")) {
  fail('Deterministic prediction families must remain explicitly non-probabilistic.');
}

if (!sql.includes('Metrics are observational only; sample is too small for an accuracy claim.')) {
  fail('Small samples must not be presented as validated model accuracy.');
}

console.log('[intelligence-calibration] PASS: authoritative realized outcomes, privacy-aware probability evaluation, sample-gated calibration, and drift contracts verified.');
