import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261101154500_r10_recommendation_security_hardening_v1.sql',
  'utf8',
);

function requireText(needle, label) {
  if (!migration.includes(needle)) {
    throw new Error(`R10 recommendation security verification failed: missing ${label} (${needle})`);
  }
}

for (const [needle, label] of [
  ['system_intelligence_recommendations_id_org_key', 'recommendation tenant unique key'],
  ['system_intelligence_recommendation_events_rec_org_fkey', 'composite recommendation/event tenant FK'],
  ['foreign key (recommendation_id, organization_id)', 'composite FK columns'],
  ['cardinality(target_lead_ids) <= 500', 'target array cardinality guard'],
  ['target_lead_count = cardinality(target_lead_ids)', 'target count consistency guard'],
  ['system_intelligence_recommendation_events_single_lifecycle_uidx', 'lifecycle idempotency unique index'],
  ["where event_type in ('accepted','dismissed','action_started','action_completed')", 'single lifecycle event guard'],
  ['revoke all on table public.system_intelligence_recommendations from anon, authenticated', 'recommendation direct mutation revocation'],
  ['revoke all on table public.system_intelligence_recommendation_events from anon, authenticated', 'event direct mutation revocation'],
  ['grant select on table public.system_intelligence_recommendations to authenticated', 'recommendation read-only grant'],
  ['grant select on table public.system_intelligence_recommendation_events to authenticated', 'event read-only grant'],
  ['system_intelligence_recommendation_events.organization_id', 'explicit outer event tenant comparison'],
  ["array['owner','admin','manager']::text[]", 'privileged recommendation role boundary'],
  ['security definer\nset search_path = public, auth, pg_temp', 'security-definer hardened RPC boundary'],
  ['INTELLIGENCE_PRIVILEGED_ROLE_REQUIRED', 'privileged-role failure'],
  ['INTELLIGENCE_TARGET_LIMIT_EXCEEDED', 'target list bound failure'],
  ['INTELLIGENCE_TARGET_TENANT_MISMATCH', 'target tenant failure'],
  ['INTELLIGENCE_TRANSITION_INVALID', 'state transition failure'],
  ['INTELLIGENCE_ACTION_ALREADY_COMPLETED', 'completed action restart failure'],
  ['to service_role;', 'service-role outcome observer grant'],
  ['a scheduled organization runner is a later R10 checkpoint', 'P0/P3 outcome-runner boundary'],
]) {
  requireText(needle, label);
}

const definerCount = (migration.match(/security definer/g) ?? []).length;
if (definerCount < 2) {
  throw new Error('R10 P0 must harden both recommendation creation and human feedback as security-definer RPCs.');
}

const authenticatedTableMutationGrant = /grant\s+(?:all|insert|update|delete|truncate|trigger|references)[^;]*\bon\s+table\s+public\.system_intelligence_recommend(?:ations|ation_events)[^;]*\bto\s+authenticated\b/i;
if (authenticatedTableMutationGrant.test(migration)) {
  throw new Error('R10 P0 must not restore direct authenticated mutation grants on recommendation tables.');
}

requireText(
  'from public, anon, authenticated, service_role;',
  'legacy recommendation creator execute revocation',
);

const observerBlock = migration.slice(
  migration.indexOf('revoke all on function public.observe_system_intelligence_recommendation_outcomes_v1(integer)'),
);
if (/grant execute[\s\S]*?observe_system_intelligence_recommendation_outcomes_v1\(integer\)[\s\S]*?to authenticated/i.test(observerBlock)) {
  throw new Error('Recommendation outcome observer must not remain executable by authenticated users.');
}

for (const forbidden of [
  'insert into public.system_intelligence_recommendations values',
  'insert into public.system_intelligence_recommendation_events values',
  'truncate table public.system_intelligence_recommendations',
  'truncate table public.system_intelligence_recommendation_events',
]) {
  if (migration.toLowerCase().includes(forbidden)) {
    throw new Error(`R10 P0 migration must not seed or truncate recommendation evidence: ${forbidden}`);
  }
}

console.log('R10 recommendation security V1 contracts verified.');
