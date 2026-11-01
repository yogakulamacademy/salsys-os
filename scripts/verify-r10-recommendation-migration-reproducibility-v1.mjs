import crypto from 'node:crypto';
import fs from 'node:fs';

const migrations = [
  ['supabase/migrations/20261018111825_system_intelligence_recommendation_learning_v1.sql', 'e86000d7244d2c5416afd773bce9d4b0'],
  ['supabase/migrations/20261018114501_system_intelligence_outcome_observation_v1.sql', '5f4a0b57b5244cc3ae5be92ea7c1c912'],
  ['supabase/migrations/20261018115609_system_intelligence_business_learning_v1.sql', '435cb3038180bfefef11614724e4d149'],
  ['supabase/migrations/20261018153024_system_intelligence_outcome_observer_v1.sql', 'cc0ae3bf02247e2bccb44306cd0dcff5'],
  ['supabase/migrations/20261018153555_system_intelligence_effectiveness_v1.sql', 'ff55331940103bf8f6449f02347056ae'],
  ['supabase/migrations/20261018154443_system_intelligence_calibration_readiness_v1.sql', '8fa01e7f082a4ffab6e97facc78d0626'],
  ['supabase/migrations/20261018155528_system_intelligence_action_completion_v1.sql', '6c0d82624bf9f324cced9109d0f86c0c'],
  ['supabase/migrations/20261018155811_system_intelligence_action_completion_effectiveness_v1.sql', '10a04d83b7920c23d19e011abc155a6e'],
];

function normalizedSql(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trimEnd();
}

for (const [path, expected] of migrations) {
  if (!fs.existsSync(path)) {
    throw new Error(`Missing ledgered R10 recommendation migration: ${path}`);
  }

  const actual = crypto.createHash('md5').update(normalizedSql(path)).digest('hex');
  if (actual !== expected) {
    throw new Error(`R10 recommendation migration drift for ${path}: expected ${expected}, got ${actual}`);
  }
}

const foundation = normalizedSql(migrations[0][0]);
const businessLearning = normalizedSql(migrations[2][0]);
const observer = normalizedSql(migrations[3][0]);
const completion = normalizedSql(migrations[6][0]);

for (const [source, needle, label] of [
  [foundation, 'system_intelligence_recommendation_events', 'recommendation event ledger'],
  [foundation, "'shown','accepted','dismissed','action_started','action_completed','outcome_observed'", 'original event vocabulary'],
  [businessLearning, 'target_lead_ids uuid[]', 'target Lead evidence'],
  [businessLearning, 'recompute_system_intelligence_learning_profile_v1', 'learning profile recomputation'],
  [observer, 'This is temporal outcome evidence, not causal attribution.', 'non-causal outcome contract'],
  [completion, 'completed_at', 'explicit action completion'],
]) {
  if (!source.includes(needle)) {
    throw new Error(`R10 recommendation provenance contract missing ${label}: ${needle}`);
  }
}

console.log('R10 recommendation migration reproducibility V1 contracts verified.');
