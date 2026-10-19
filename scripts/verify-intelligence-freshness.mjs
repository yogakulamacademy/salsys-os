import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20261020100000_event_intelligence_prediction_freshness_v1.sql';
const sweepPath = 'supabase/migrations/20261020100100_event_intelligence_prediction_expiry_sweep_v1.sql';
const actionablePath = 'supabase/migrations/20261020100200_event_intelligence_actionable_freshness_v1.sql';
const currentGuardPath = 'supabase/migrations/20261020100300_event_intelligence_current_freshness_guard_v1.sql';

function fail(message) {
  console.error(`\n[intelligence-freshness] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const sql = read(migrationPath);
const sweep = read(sweepPath);
const actionable = read(actionablePath);
const currentGuard = read(currentGuardPath);

const checks = [
  ['event_intelligence_prediction_max_feature_age_v1', 'central feature-age policy'],
  ["when 'session_conversion_intent' then interval '24 hours'", 'session intent freshness window'],
  ["when 'traffic_decline_risk' then interval '72 hours'", 'traffic risk freshness window'],
  ["when 'seo_growth_opportunity' then interval '7 days'", 'SEO opportunity freshness window'],
  ["when 'paid_attribution_gap_risk' then interval '72 hours'", 'paid attribution freshness window'],
  ['v_feature_observed_at > v_generated_at + interval \'5 minutes\'', 'future-evidence clock guard'],
  ['v_generated_at-v_feature_observed_at > v_max_feature_age', 'stale feature rejection'],
  ["return null;", 'non-emission path for invalid/stale predictions'],
  ["status='expired'", 'existing stale prediction expiration'],
  ['v_event_intelligence_prediction_freshness_health_v1', 'freshness health view'],
  ['stale_active_predictions', 'stale-active health metric'],
  ['freshness_skips', 'refresh skip accounting'],
  ["and (p.expires_at is null or p.expires_at>now())", 'expired lead-prediction bridge guard'],
  ["and (m.id is null or m.status='active')", 'inactive model-version bridge guard'],
];

for (const [needle, label] of checks) {
  if (!sql.includes(needle)) fail(`Freshness migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['expire_event_intelligence_predictions_v1', 'active prediction expiry sweep'],
  ["p.expires_at is not null and p.expires_at<=now()", 'time-expiry cleanup independent of feature presence'],
  ['refresh_event_intelligence_predictions_freshness_inner_v1', 'freshness-aware inner refresh preservation'],
  ["'expired_before_refresh'", 'expiry sweep accounting'],
  ["'active_expiry_sweep',true", 'refresh disclosure that expiry sweep ran'],
  ['for r in select id from public.organizations', 'one-time all-tenant cleanup'],
]) {
  if (!sweep.includes(needle)) fail(`Expiry-sweep migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['v_feature_fresh_until := v_feature_observed_at + v_max_feature_age', 'feature freshness deadline'],
  ['v_expires_at := v_feature_fresh_until', 'prediction expiry capped to evidence lifetime'],
  ["'feature_fresh_until'", 'freshness deadline provenance'],
  ["'remaining_fresh_seconds_at_generation'", 'remaining evidence lifetime provenance'],
  ['now()-f.observed_at>public.event_intelligence_prediction_max_feature_age_v1', 'action-time stale sweep'],
  ['current_feature_age_seconds', 'current evidence age health metric'],
  ['f.observed_at>now()+interval \'5 minutes\'', 'action-time future evidence guard'],
]) {
  if (!actionable.includes(needle)) fail(`Actionable-freshness migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['record_event_intelligence_prediction_freshness_inner_v1', 'current-time guard wrapper'],
  ['p_expires_at<=v_now', 'already-expired source prediction guard'],
  ["v_feature_observed_at>v_now+interval '5 minutes'", 'current-time future evidence guard'],
  ['v_feature_observed_at+v_max_feature_age<=v_now', 'current-time stale evidence guard'],
]) {
  if (!currentGuard.includes(needle)) fail(`Current-time freshness guard is missing ${label} (${needle}).`);
}

if (!sql.includes("'calibrated_probability',false")) {
  fail('Deterministic ranking predictions must remain explicitly non-probabilistic.');
}

if (!sql.includes("'feature_freshness_guard',true")) {
  fail('Prediction refresh response must disclose that the freshness guard is active.');
}

console.log('[intelligence-freshness] PASS: generation-time freshness, current-time evidence validity, capped action lifetime, stale suppression, expiry sweeping, and freshness-health contracts verified.');
