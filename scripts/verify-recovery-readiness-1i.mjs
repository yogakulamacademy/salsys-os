import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1i recovery verification failed: ${message}`);
  }
}

const baseline = read('supabase/recovery/023_integration_connections_baseline.sql');
const evidence = read('docs/checkpoints/PH-5.2B.1h-1i-replay-evidence.md');

for (const [needle, label] of [
  ['create table if not exists public.integration_connections', 'integration_connections table'],
  ['organization_id uuid not null', 'tenant ownership'],
  ['references public.organizations(id)', 'organization FK'],
  ['references public.profiles(id)', 'connected_by profile FK'],
  ['integration_connections_parent_connection_id_fkey', 'self-parent FK'],
  ['integration_connections_status_check', 'status invariant'],
  ['integration_connections_org_provider_external_uidx', 'tenant/provider/external uniqueness'],
  ['create or replace function public.touch_integration_updated_at()', 'updated-at trigger function'],
  ['create or replace function public.enforce_integration_connection_parent_org()', 'parent-org guard function'],
  ['trg_integration_connections_updated_at', 'updated-at trigger'],
  ['trg_integration_connections_parent_org_guard', 'parent-org trigger'],
  ['enable row level security', 'RLS'],
  ['create policy deny_direct_client_access', 'fail-closed policy'],
  ['using (false)', 'deny policy predicate'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only safety boundary'],
]) {
  assert(baseline.includes(needle), `missing ${label}.`);
}

assert(
  !baseline.includes('integration_connections_provider_check') &&
    !baseline.includes('integration_connections_auth_mode_check'),
  'pre-023 baseline must leave provider/auth-mode checks to migration 023.',
);

assert(
  !baseline.includes("'instagram'::text"),
  'pre-023 baseline must not pull the later Instagram provider expansion backward.',
);

assert(
  !baseline.includes('insert into public.integration_connections'),
  'integration recovery baseline must not copy production connection rows.',
);

for (const [needle, label] of [
  ['`020_attribution_workspace_tenant_scope` ✅', '020 replay pass'],
  ['`022_normalize_attribution_enrollment_boolean` ✅', '022 replay pass'],
  ['`023_integration_api_credentials` ✅', '023 replay pass'],
  ['`029_person_course_affinity` ✅', '029 replay pass'],
  ['relation "public.v_admissions_priority_queue" does not exist', 'migration 030 boundary'],
  ['public.v_lead_revenue_status', 'missing revenue dependency'],
  ['public.v_paid_media_leads_ui', 'missing paid-media dependency'],
  ['migration `029_person_course_affinity` inclusive', 'proven frontier'],
]) {
  assert(evidence.includes(needle), `evidence missing ${label}.`);
}

console.log('PH-5.2B.1i integration recovery and replay-frontier contracts verified.');
