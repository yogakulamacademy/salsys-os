import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`PA-1 identity merge verification failed: missing ${label} (${needle})`);
  }
}

function forbidText(source, needle, label) {
  if (source.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`PA-1 identity merge verification failed: forbidden ${label} (${needle})`);
  }
}

const migration = read(
  'supabase/migrations/20261101130000_human_approved_identity_merge_v1.sql',
);
const action = read('app/actions/identity-resolution.ts');
const dataQuality = read('app/data-quality/page.tsx');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');

for (const [needle, label] of [
  ['create table if not exists public.person_merge_audit_v1', 'durable merge audit table'],
  ['alter table public.person_merge_audit_v1 enable row level security', 'merge-audit RLS'],
  ['revoke all on table public.person_merge_audit_v1 from public, anon, authenticated', 'direct merge-audit access denial'],
  ['create or replace function public.merge_identity_resolution_conflict_v1(', 'human merge RPC'],
  ['security definer', 'controlled privileged transaction'],
  ['can_administer_organization_crm', 'manager/admin authorization'],
  ["coalesce(cardinality(v_conflict.candidate_person_ids), 0) <> 1", 'initiating one-candidate merge boundary'],
  ["and coalesce(cardinality(c.candidate_person_ids), 0) = 1", 'related one-candidate conflict boundary'],
  ['pa1-person-merge:', 'pair-scoped concurrency lock'],
  ['source_privacy_blockers', 'source privacy/legal preflight'],
  ['target_active_privacy_blockers', 'target active privacy/legal preflight'],
  ['active_ad_blockers', 'active ad state preflight'],
  ['update public.person_identifiers', 'identifier ownership transfer'],
  ['update public.person_leads', 'opportunity ownership transfer'],
  ['update public.person_sessions', 'session ownership transfer'],
  ['update public.privacy_consent_receipts', 'consent canonical association transfer'],
  ["status = 'merged'", 'source Person merged state'],
  ["'merged_into_person_id'", 'source-to-target merge provenance'],
  ["resolution_action = 'merged_after_human_review'", 'human merge resolution provenance'],
  ['resolved_person_id = v_target_person_id', 'resolved canonical Person'],
  ['insert into public.person_merge_audit_v1', 'durable audit insertion'],
  ['revoke all on function public.merge_identity_resolution_conflict_v1(uuid)', 'RPC execute hardening'],
  ['to authenticated, service_role', 'explicit RPC execution grant'],
]) {
  requireText(migration, needle, label);
}

for (const [needle, label] of [
  ['delete from public.persons', 'Person hard delete'],
  ['delete from public.person_identifiers', 'identifier deletion'],
  ['delete from public.person_leads', 'Person-Lead deletion'],
  ['delete from public.person_sessions', 'Person-Session deletion'],
  ['delete from public.privacy_consent_receipts', 'consent receipt deletion'],
  ['subject_key =', 'captured privacy subject-key rewrite'],
]) {
  forbidText(migration, needle, label);
}

for (const [needle, label] of [
  ['mergeIdentityResolutionConflictAction', 'server merge action'],
  ['merge_identity_resolution_conflict_v1', 'canonical merge RPC invocation'],
  ['revalidateIdentityWorkspaces', 'cross-workspace revalidation'],
  ['identity-conflict-merged', 'merge completion notice'],
]) {
  requireText(action, needle, label);
}

for (const [needle, label] of [
  ['merge?: string | string[]', 'two-step merge query state'],
  ['Same person', 'human merge intent control'],
  ['Confirm same person & merge', 'explicit second confirmation'],
  ['Cancel merge', 'confirmation cancellation'],
  ['candidateIds.length === 1', 'UI one-candidate boundary'],
  ['Multi-candidate review only', 'multi-candidate fail-closed UI'],
  ['No automatic merge from this workspace', 'explicit no-automerge statement'],
  ['privacy, legal or ad-delivery state', 'visible merge safety explanation'],
]) {
  requireText(dataQuality, needle, label);
}

requireText(
  packageJson,
  'verify:human-approved-identity-merge-v1',
  'package PA-1 verifier script',
);
requireText(
  ci,
  'npm run verify:human-approved-identity-merge-v1',
  'CI PA-1 verifier step',
);

console.log('PA-1 human-approved identity merge contracts verified.');
