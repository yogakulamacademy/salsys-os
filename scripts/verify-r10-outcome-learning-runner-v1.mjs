import crypto from 'node:crypto';
import fs from 'node:fs';

const migrationPath =
  'supabase/migrations/20261101164458_r10_outcome_learning_runner_v1.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const lower = migration.toLowerCase();
const presentation = fs.readFileSync(
  'app/api/intelligence/recommendations/present/route.ts',
  'utf8',
);
const component = fs.readFileSync(
  'components/home/recommended-actions.tsx',
  'utf8',
);

function expect(condition, message) {
  if (!condition) throw new Error(`R10-P3 verification failed: ${message}`);
}

function requireText(source, needle, label) {
  expect(source.includes(needle), `missing ${label} (${needle})`);
}

function normalizedSql(source) {
  return source.replace(/\r\n/g, '\n').trimEnd();
}

const migrationMd5 = crypto
  .createHash('md5')
  .update(normalizedSql(migration))
  .digest('hex');

expect(
  Buffer.byteLength(migration, 'utf8') === 28799,
  `production migration byte length drift: expected 28799, got ${Buffer.byteLength(migration, 'utf8')}`,
);
expect(
  migrationMd5 === '8d1fa6a3f4b032300b84212fd0fc0571',
  `production migration ledger drift: expected 8d1fa6a3f4b032300b84212fd0fc0571, got ${migrationMd5}`,
);

for (const [needle, label] of [
  ['system_intelligence_outcome_runs', 'tenant-scoped outcome run ledger'],
  ['enable row level security', 'run-ledger RLS'],
  ['system_intelligence_outcome_runs_select', 'run-ledger tenant SELECT policy'],
  ['grant select on table public.system_intelligence_outcome_runs to authenticated', 'authenticated run-ledger SELECT only'],
  ['revoke all on table public.system_intelligence_learning_profiles from public, anon, authenticated', 'learning-profile direct-mutation revocation'],
  ['grant select on table public.system_intelligence_learning_profiles to authenticated', 'learning-profile SELECT-only grant'],
  ['observe_system_intelligence_recommendation_outcomes_v2', 'machine-safe V2 observer'],
  ['p_organization_id uuid', 'explicit machine tenant argument'],
  ['security definer', 'trusted function execution'],
  ["o.status = 'active'", 'active-organization validation'],
  ["r.source_version in ('v2','r10-p1')", 'supported recommendation source families'],
  ['for update skip locked', 'concurrent observer row locking'],
  ["interval '15 minutes'", 'minimum post-action observation delay'],
  ["interval '72 hours'", 'first inconclusive boundary'],
  ['This is temporal outcome evidence, not causal attribution.', 'non-causal observer wording'],
  ['recompute_system_intelligence_learning_profile_v2', 'latest-per-recommendation learning recomputation'],
  ['r.last_business_outcome_class', 'latest recommendation outcome sample'],
  ['score_adjustment is not automatically applied to live priority', 'descriptive-learning boundary'],
  ['sweep_system_intelligence_recommendation_outcomes_v1', 'bounded multi-tenant sweep'],
  ["p_trigger_source text default 'cron'", 'runner trigger provenance'],
  ['organizations_failed', 'runner failure accounting'],
  ["'partial'", 'partial-run state'],
  ["'intelligence_outcomes'", 'System Health system key'],
  ["'Recommendation Outcome Learning'", 'System Health system label'],
  ["lower(coalesce(l.latest_status,''))='partial'", 'partial health warning'],
  ["'*/15 * * * *'", '15-minute cron cadence'],
  ["'salsys-intelligence-outcome-learning-v1'", 'single named P3 cron job'],
  ["select public.sweep_system_intelligence_recommendation_outcomes_v1(null,50,'cron');", 'cron uses hardened sweep'],
]) {
  requireText(migration, needle, label);
}

expect(
  (migration.match(/create or replace function public\.observe_system_intelligence_recommendation_outcomes_v2/g) ?? []).length === 1,
  'V2 observer must be defined exactly once',
);
expect(
  (migration.match(/cron\.schedule\(/g) ?? []).length === 1,
  'P3 migration must register exactly one cron schedule',
);
expect(
  (migration.match(/salsys-intelligence-outcome-learning-v1/g) ?? []).length >= 2,
  'P3 cron must be guarded by one stable job name',
);

const sweepStart = migration.indexOf(
  'create or replace function public.sweep_system_intelligence_recommendation_outcomes_v1',
);
const healthStart = migration.indexOf(
  'create or replace view public.v_system_health',
);
expect(sweepStart >= 0 && healthStart > sweepStart, 'bounded sweep function section must be present');
const sweepSource = migration.slice(sweepStart, healthStart);
expect(
  !sweepSource.includes('observe_system_intelligence_recommendation_outcomes_v1('),
  'runner must never schedule/call the legacy human-session V1 observer',
);
requireText(
  sweepSource,
  'observe_system_intelligence_recommendation_outcomes_v2(v_org.id,v_limit)',
  'runner V2 observer call',
);
requireText(
  sweepSource,
  'recompute_system_intelligence_learning_profile_v2',
  'runner V2 learning recomputation',
);
requireText(
  sweepSource,
  'exception when others',
  'per-tenant/per-learning exception isolation',
);

const authenticatedLearningMutationGrant =
  /grant\s+(?:insert|update|delete|truncate|all)[^;]*system_intelligence_learning_profiles[^;]*authenticated/i;
expect(
  !authenticatedLearningMutationGrant.test(migration),
  'authenticated users must not receive direct learning-profile mutation privileges',
);

for (const fnName of [
  'observe_system_intelligence_recommendation_outcomes_v2(uuid,integer)',
  'recompute_system_intelligence_learning_profile_v2(uuid,text,text)',
  'sweep_system_intelligence_recommendation_outcomes_v1(uuid,integer,text)',
]) {
  requireText(
    migration,
    `revoke all on function public.${fnName} from public, anon, authenticated`,
    `${fnName} untrusted EXECUTE revocation`,
  );
  requireText(
    migration,
    `grant execute on function public.${fnName} to service_role`,
    `${fnName} service-role boundary`,
  );
}

const effectivenessSource = migration.slice(
  migration.indexOf('create or replace function public.get_system_intelligence_recommendation_effectiveness_v1'),
  migration.indexOf('create or replace function public.get_system_intelligence_action_completion_effectiveness_v1'),
);
requireText(
  effectivenessSource,
  "r.source_version in ('v2','r10-p1')",
  'effectiveness coverage for live R10 family',
);

const completionSource = migration.slice(
  migration.indexOf('create or replace function public.get_system_intelligence_action_completion_effectiveness_v1'),
  sweepStart,
);
requireText(
  completionSource,
  "r.source_version in ('v2','r10-p1')",
  'completion coverage for live R10 family',
);

const learningStart = migration.indexOf(
  'create or replace function public.recompute_system_intelligence_learning_profile_v2',
);
const effectivenessStart = migration.indexOf(
  'create or replace function public.get_system_intelligence_recommendation_effectiveness_v1',
);
const learningSource = migration.slice(learningStart, effectivenessStart);
expect(
  !learningSource.includes('system_intelligence_recommendation_events e'),
  'P3 V2 learning must not count raw outcome-event rows as independent samples',
);
requireText(
  learningSource,
  'from public.system_intelligence_recommendations r',
  'one-latest-sample-per-recommendation learning source',
);

for (const source of [presentation, component]) {
  for (const forbidden of [
    'system_intelligence_learning_profiles',
    'score_adjustment',
    'conversion_probability',
  ]) {
    expect(
      !source.includes(forbidden),
      `live P1/P2 recommendation surface must not consume P3 learning/predictive ranking (${forbidden})`,
    );
  }
}

for (const forbidden of [
  'insert into public.system_intelligence_recommendations values',
  'truncate table public.system_intelligence_recommendations',
  'truncate table public.system_intelligence_recommendation_events',
  'delete from public.system_intelligence_recommendations',
]) {
  expect(!lower.includes(forbidden), `migration must not seed/destructively rewrite recommendation evidence (${forbidden})`);
}

console.log('R10-P3 Observed Outcome & Learning Runner contracts verified.');
