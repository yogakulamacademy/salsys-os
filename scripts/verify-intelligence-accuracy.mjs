import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const files = {
  migration: 'supabase/migrations/20261019181500_intelligence_signal_quality_v1.sql',
  identityRollupFix: 'supabase/migrations/20261019181600_intelligence_signal_quality_identity_rollup_fix_v1.sql',
  snapshotRoute: 'app/api/intelligence/lead-scoring-snapshot/route.ts',
};

function fail(message) {
  console.error(`\n[intelligence-accuracy] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const migration = read(files.migration);
const identityRollupFix = read(files.identityRollupFix);
const route = read(files.snapshotRoute);

const migrationChecks = [
  ['v_r10_lead_signal_quality_v1', 'consent-aware lead signal-quality view'],
  ['web_behavior_usable_for_profiling', 'web-behavior availability contract'],
  ['profiling_allowed', 'profiling permission guard'],
  ['unavailable_unknown', 'unknown analytics evidence state'],
  ['unavailable_mixed_choices', 'mixed-choice fail-closed state'],
  ['v_r10_lead_training_dataset_safe_v2', 'safe V2 training dataset'],
  ['r10-lead-features-safe-v2', 'safe V2 snapshot version'],
  ['v_r10_lead_model_training_readiness_safe_v2', 'safe V2 training readiness view'],
  ['v_intelligence_accuracy_health_v1', 'intelligence accuracy health view'],
  ['observed_probability_predictions', 'realized probability observation counter'],
];

for (const [needle, label] of migrationChecks) {
  if (!migration.includes(needle)) fail(`Migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['person_rollup as (', 'independent person identity rollup'],
  ['visitor_rollup as (', 'independent visitor/session rollup'],
  ['coalesce(v.linked_session_count,0)', 'visitor-only session-count aggregation'],
  ['coalesce(v.linked_sessions_30d,0)', 'visitor-only recent-session aggregation'],
]) {
  if (!identityRollupFix.includes(needle)) fail(`Identity-rollup fix is missing ${label} (${needle}).`);
}

const routeChecks = [
  [".from('v_r10_lead_signal_quality_v1')", 'signal-quality source'],
  ["action: 'skipped_privacy_restricted'", 'privacy-restricted skip action'],
  ["snapshot_version: 'r10-lead-features-safe-v2'", 'safe V2 snapshot write'],
  ['missing_or_withheld_web_evidence_is_null_not_zero', 'missing-evidence guardrail'],
  ['privacy_restricted_leads_are_not_profiled', 'profiling restriction guardrail'],
  ['web_behavior_usable_for_profiling', 'web evidence usability gate'],
  ['nullableFiniteNumber', 'nullable numeric preservation'],
];

for (const [needle, label] of routeChecks) {
  if (!route.includes(needle)) fail(`Snapshot route is missing ${label} (${needle}).`);
}

if (route.includes('function finiteNumber(value: unknown)')) {
  fail('Snapshot route must not silently coerce missing numeric evidence to zero.');
}

if (!migration.includes("s.outcome_label in ('positive','negative')")) {
  fail('Safe training dataset must remain limited to realized binary outcomes.');
}

if (!migration.includes('s.observed_at < s.outcome_at')) {
  fail('Safe training dataset must enforce strict point-in-time ordering before outcome.');
}

console.log('[intelligence-accuracy] PASS: privacy-aware evidence, cardinality-safe identity rollups, and safe-training contracts verified.');
