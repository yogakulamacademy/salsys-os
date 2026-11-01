import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261101180500_r11_p1_education_surface_authorization_v1.sql',
  'utf8',
);
const leadTriggerContextMigration = fs.readFileSync(
  'supabase/migrations/20261101180600_r11_p1_lead_capability_trigger_context_v1.sql',
  'utf8',
);
const workspaceRoute = fs.readFileSync('app/api/workspace/route.ts', 'utf8');
const workspaceLib = fs.readFileSync('lib/workspace.ts', 'utf8');
const operationsAccess = fs.readFileSync('lib/operations-access.ts', 'utf8');
const routeAccess = fs.readFileSync('lib/route-access.ts', 'utf8');
const admissionsLayout = fs.readFileSync('app/admissions/layout.tsx', 'utf8');
const rootShell = fs.readFileSync('components/root-shell.tsx', 'utf8');
const navGate = fs.readFileSync(
  'components/product-capability-navigation-gate.tsx',
  'utf8',
);
const genericLeadForm = fs.readFileSync(
  'components/forms/generic-lead-form.tsx',
  'utf8',
);
const newLeadPage = fs.readFileSync('app/leads/new/page.tsx', 'utf8');
const editLeadPage = fs.readFileSync('app/leads/[id]/edit/page.tsx', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`R11-P1 verification failed: ${message}`);
}

function has(source, needle, label) {
  expect(source.includes(needle), `missing ${label} (${needle})`);
}

for (const [needle, label] of [
  ['create or replace function public.can_access_education_operations', 'Education operations access helper'],
  ["organization_has_capability(p_organization_id, 'education_core')", 'Education Core capability requirement'],
  ["array['owner','admin','manager']::text[]", 'privileged role requirement'],
  ['rename to get_course_management_workspace_internal_v2', 'internal Course Management aggregator rename'],
  ['create or replace function public.get_course_management_workspace_v2', 'stable public Course Management RPC'],
  ['EDUCATION_OPERATIONS_ACCESS_REQUIRED', 'Course Management fail-closed error'],
  ['get_course_management_workspace_internal_v2(', 'guarded internal aggregator delegation'],
  ['create or replace function public.get_admissions_snapshot', 'Admissions entry hardening'],
  ['EDUCATION_ADMISSIONS_ACCESS_REQUIRED', 'Admissions fail-closed error'],
  ['create or replace function public.enforce_lead_education_capability_v1', 'canonical Lead capability trigger'],
  ['create trigger leads_enforce_education_capability', 'Lead capability trigger registration'],
  ['new.interested_course_id := null', 'non-Education insert course nulling'],
  ['new.preferred_batch_id := null', 'non-Education insert batch nulling'],
  ['new.preferred_location := old.preferred_location', 'historical preference preservation'],
  ['alter policy enrollments_read', 'Enrollment read capability gate'],
  ['alter policy enrollments_insert', 'Enrollment insert capability gate'],
  ['alter policy enrollments_update', 'Enrollment update capability gate'],
  ['alter policy enrollments_delete', 'Enrollment delete capability gate'],
]) {
  has(migration, needle, label);
}

for (const [needle, label] of [
  ['from public.organization_capabilities oc', 'direct organization capability truth lookup'],
  ["oc.capability_code = 'education_core'", 'direct Education Core lookup'],
  ["cc.status = 'active'", 'active capability catalog requirement'],
  ["o.status = 'active'", 'active organization requirement'],
  ['new.preferred_batch_id := null', 'auth-context-independent insert sanitization'],
  ['new.preferred_batch_id := old.preferred_batch_id', 'auth-context-independent historical preservation'],
]) {
  has(leadTriggerContextMigration, needle, label);
}

expect(
  !leadTriggerContextMigration.includes('auth.role()'),
  'canonical Lead trigger must not depend on JWT auth role context.',
);
expect(
  !leadTriggerContextMigration.includes('organization_has_capability('),
  'canonical Lead trigger must query capability truth directly rather than a session-gated helper.',
);

expect(
  migration.match(/organization_has_capability\(organization_id, 'education_core'\)/g)?.length >= 4,
  'all Enrollment policies must require Education Core.',
);

for (const source of [migration, leadTriggerContextMigration]) {
  for (const forbidden of [
    'insert into public.courses',
    'insert into public.course_batches',
    'insert into public.enrollments',
    'insert into public.organization_workspaces',
    'update public.organization_workspaces',
    'delete from public.organization_workspaces',
    'yogakulam-courses',
    'wellness_residential',
  ]) {
    expect(
      !source.toLowerCase().includes(forbidden.toLowerCase()),
      `P1 migrations must not drift into unrelated/future scope (${forbidden})`,
    );
  }
}

for (const [source, needle, label] of [
  [workspaceLib, 'getEnabledOrganizationCapabilities', 'workspace capability loader'],
  [workspaceLib, 'organizationHasCapabilityForCurrentSession', 'session-bound capability helper'],
  [workspaceLib, 'canAccessEducationOperationsForCurrentSession', 'session-bound Education operations helper'],
  [workspaceRoute, 'capabilities,', 'workspace API capability response'],
  [workspaceRoute, 'getEnabledOrganizationCapabilities', 'workspace API server-derived capability lookup'],
  [operationsAccess, 'canAccessEducationOperationsForCurrentSession', 'Operations route capability gate'],
  [operationsAccess, '/dashboard?restricted=education', 'Operations restricted redirect'],
  [routeAccess, 'requireEducationOperationsAccess', 'Admissions privileged Education gate'],
  [admissionsLayout, 'requireEducationOperationsAccess()', 'Admissions layout capability enforcement'],
  [rootShell, 'ProductCapabilityNavigationGate', 'global capability navigation wrapper'],
  [navGate, 'capabilities.includes("education_core")', 'navigation Education capability check'],
  [navGate, 'button[aria-label="Open Operations"]', 'legacy Operations navigation hiding'],
  [navGate, 'a[href="/admissions"]', 'Admissions navigation hiding'],
  [navGate, 'a[href="/course-management"]', 'Course Management navigation hiding'],
]) {
  has(source, needle, label);
}

for (const [source, needle, label] of [
  [newLeadPage, 'isEducationCoreEnabledForCurrentSession', 'new-lead capability check'],
  [newLeadPage, 'educationEnabled\n    ? await Promise.all([getCourses(), getCourseBatches()])', 'new-lead conditional Education loading'],
  [newLeadPage, '<GenericLeadForm', 'generic new-lead surface'],
  [editLeadPage, 'isEducationCoreEnabledForCurrentSession', 'edit-lead capability check'],
  [editLeadPage, 'educationEnabled\n    ? await Promise.all([getCourses(), getCourseBatches()])', 'edit-lead conditional Education loading'],
  [editLeadPage, '<GenericLeadForm', 'generic edit-lead surface'],
  [genericLeadForm, 'Commercial context', 'generic commercial lead surface'],
  [genericLeadForm, 'Potential lead value', 'generic manual value controls'],
]) {
  has(source, needle.replaceAll('\\n', '\n'), label);
}

for (const forbiddenEducationField of [
  'name="course_id"',
  'name="preferred_batch_id"',
  'name="preferred_location"',
  'name="preferred_month"',
  'name="preferred_mode"',
]) {
  expect(
    !genericLeadForm.includes(forbiddenEducationField),
    `generic Lead form must not render Education-only field ${forbiddenEducationField}`,
  );
}

expect(
  !workspaceRoute.includes('set_organization_capability_v1'),
  'normal workspace API must remain read-only for capability state.',
);
expect(
  !navGate.includes('organization_capabilities'),
  'client navigation must consume trusted workspace capability context, not query capability tables directly.',
);

has(
  packageJson,
  'verify:r11-p1-product-surface-gating-v1',
  'R11-P1 verifier package script',
);

console.log('R11-P1 product surface gating contracts verified.');
