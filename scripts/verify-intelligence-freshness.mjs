import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20261020100000_event_intelligence_prediction_freshness_v1.sql';
const absolute = path.join(root, migrationPath);

function fail(message) {
  console.error(`\n[intelligence-freshness] FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(absolute)) fail(`Missing required file: ${migrationPath}`);
const sql = fs.readFileSync(absolute, 'utf8');

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

if (!sql.includes("'calibrated_probability',false")) {
  fail('Deterministic ranking predictions must remain explicitly non-probabilistic.');
}

if (!sql.includes("'feature_freshness_guard',true")) {
  fail('Prediction refresh response must disclose that the freshness guard is active.');
}

console.log('[intelligence-freshness] PASS: prediction freshness, stale suppression, and freshness-health contracts verified.');
