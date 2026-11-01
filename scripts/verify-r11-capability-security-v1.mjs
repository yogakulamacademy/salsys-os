import fs from 'node:fs';

const migrationPath =
  'supabase/migrations/20261101173500_r11_capability_security_foundation_v1.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const lower = migration.toLowerCase();
const courseActions = fs.readFileSync('app/course-management/actions.ts', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`R11-P0 verification failed: ${message}`);
}

function requireText(source, needle, label) {
  expect(source.includes(needle), `missing ${label} (${needle})`);
}

for (const [needle, label] of [
  ['create table if not exists public.capability_catalog', 'capability catalog'],
  ['create table if not exists public.organization_capabilities', 'organization capability state'],
  ["'education_core'", 'Education Core capability'],
  ["'wellness_residential'", 'Wellness / Residential capability'],
  ["'education_catalog_sync'", 'Education Catalog Sync capability'],
  ['organization_capabilities_member_select', 'tenant capability SELECT policy'],
  ['session_is_bound_to_organization(organization_id)', 'session-bound capability reads'],
  ['enforce_organization_capability_dependencies_v1', 'dependency trigger function'],
  ['CAPABILITY_DEPENDENCY_REQUIRED: education_core', 'dependent-capability guard'],
  ['CAPABILITY_DEPENDENTS_ENABLED', 'core-disable guard'],
  ['organization_has_capability', 'canonical capability helper'],
  ["auth.role() = 'service_role'", 'trusted explicit-org capability path'],
  ["auth.role() = 'authenticated'", 'authenticated capability path'],
  ['set_organization_capability_v1', 'trusted capability mutation RPC'],
  ["auth.role() <> 'service_role'", 'service-role-only mutation enforcement'],
  ['CAPABILITY_CONFIG_INVALID', 'bounded object config validation'],
  ["o.slug = 'yogakulam-academy'", 'stable-slug Yogakulam activation'],
  ["'r11_p0_existing_production_usage'", 'explicit Education activation provenance'],
  ["'r11_p0_existing_catalog_sync_usage'", 'explicit catalog-sync activation provenance'],
  ["'r11_p0_existing_residential_usage'", 'explicit residential activation provenance'],
  ["organization_has_capability(p_organization_id, 'education_core')", 'capability-aware course administration'],
  ['alter policy courses_read', 'capability-aware course read policy'],
  ['alter policy course_batches_read', 'capability-aware batch read policy'],
  ['revoke all on table public.courses from authenticated', 'courses privilege reset'],
  ['revoke all on table public.course_batches from authenticated', 'batches privilege reset'],
  ['grant select, insert, update on table public.courses to authenticated', 'courses least-privilege grant'],
  ['grant select, insert, update on table public.course_batches to authenticated', 'batches least-privilege grant'],
  ['grant execute on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text)', 'V2 batch update grant'],
  ['grant execute on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text)', 'V2 enrollment-state grant'],
  ['grant execute on function public.set_course_batch_active_state_v2(uuid,uuid,boolean)', 'V2 active-state grant'],
  ['revoke execute on function public.update_course_batch_admin(uuid,integer,integer,integer,integer,text,numeric,text,text)', 'legacy V1 update revoke'],
  ['revoke execute on function public.set_course_batch_enrollment_state(uuid,boolean,text)', 'legacy V1 enrollment revoke'],
  ['revoke execute on function public.set_course_batch_active_state(uuid,boolean)', 'legacy V1 active-state revoke'],
]) {
  requireText(migration, needle, label);
}

for (const [needle, label] of [
  ['rpc("update_course_batch_admin_v2"', 'authenticated V2 batch update call'],
  ['rpc("set_course_batch_enrollment_state_v2"', 'authenticated V2 enrollment-state call'],
  ['rpc("set_course_batch_active_state_v2"', 'authenticated V2 active-state call'],
]) {
  requireText(courseActions, needle, label);
}

expect(
  courseActions.includes('await createClient()'),
  'Course Management actions must remain on the authenticated user/session client, not service-role escalation.',
);
expect(
  !courseActions.includes('createAdminClient'),
  'Course Management user actions must not bypass tenant/role checks through the admin client.',
);

expect(
  !migration.includes('3d9ef175-1624-4d89-a0bd-73d3f82c23c0'),
  'Yogakulam activation must resolve by stable slug, never a generated organization UUID.',
);

for (const forbidden of [
  'insert into public.courses',
  'insert into public.course_batches',
  'insert into public.enrollments',
  'insert into public.organization_workspaces',
  'update public.organization_workspaces',
  'delete from public.organization_workspaces',
]) {
  expect(!lower.includes(forbidden), `P0 must not mutate unrelated/business truth (${forbidden})`);
}

for (const forbiddenGrant of [
  'grant delete on table public.courses to authenticated',
  'grant truncate on table public.courses to authenticated',
  'grant trigger on table public.courses to authenticated',
  'grant references on table public.courses to authenticated',
  'grant delete on table public.course_batches to authenticated',
  'grant truncate on table public.course_batches to authenticated',
  'grant trigger on table public.course_batches to authenticated',
  'grant references on table public.course_batches to authenticated',
]) {
  expect(!lower.includes(forbiddenGrant), `P0 must not regrant broad authenticated table privilege (${forbiddenGrant})`);
}

const catalogIndex = migration.indexOf("'education_core'");
const activationIndex = migration.indexOf("o.slug = 'yogakulam-academy'");
const authIndex = migration.indexOf('create or replace function public.can_administer_course_management');
expect(
  catalogIndex >= 0 && activationIndex > catalogIndex && authIndex > activationIndex,
  'P0 ordering must seed catalog, activate existing tenant, then make course authorization capability-aware.',
);

const dependencyTriggerIndex = migration.indexOf(
  'create trigger organization_capabilities_enforce_dependencies',
);
expect(
  dependencyTriggerIndex >= 0 && dependencyTriggerIndex < activationIndex,
  'Capability dependency trigger must be active before Yogakulam dependent capabilities are inserted.',
);

for (const legacySignature of [
  'update_course_batch_admin(uuid,integer,integer,integer,integer,text,numeric,text,text)',
  'set_course_batch_enrollment_state(uuid,boolean,text)',
  'set_course_batch_active_state(uuid,boolean)',
]) {
  const escaped = legacySignature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grantPattern = new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped}[\\s\\S]{0,120}authenticated`,
    'i',
  );
  expect(!grantPattern.test(migration), `Legacy V1 RPC must not regain authenticated EXECUTE (${legacySignature})`);
}

console.log('R11-P0 capability + security foundation contracts verified.');
