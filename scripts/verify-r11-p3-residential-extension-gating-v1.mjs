import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261101193000_r11_p3_residential_capability_boundary_v1.sql',
  'utf8',
);
const educationAccess = fs.readFileSync('lib/education-access.ts', 'utf8');
const courseLayout = fs.readFileSync('app/course-management/layout.tsx', 'utf8');
const courseCss = fs.readFileSync(
  'app/course-management/course-management-violet.css',
  'utf8',
);
const packageJson = fs.readFileSync('package.json', 'utf8');
const latentRpcHardening = fs.readFileSync(
  'supabase/migrations/20261014092325_latent_accommodation_rpc_execute_hardening.sql',
  'utf8',
);

function expect(condition, message) {
  if (!condition) throw new Error(`R11-P3 verification failed: ${message}`);
}

function has(source, needle, label) {
  expect(source.includes(needle), `missing ${label} (${needle})`);
}

for (const [needle, label] of [
  ["organization_has_residential_data_v1", 'canonical residential data detector'],
  ["WELLNESS_RESIDENTIAL_DATA_PRESENT", 'fail-closed capability disable guard'],
  ["enforce_course_batch_residential_capability_v1", 'mixed batch residential field guard'],
  ["course_batches_enforce_residential_capability", 'course batch residential trigger'],
  ["new.price_private := null", 'non-residential private price suppression'],
  ["new.accommodation_remaining := null", 'non-residential accommodation availability suppression'],
  ["alter policy accommodation_properties_read", 'property read policy hardening'],
  ["alter policy accommodation_rooms_read", 'room read policy hardening'],
  ["alter policy batch_accommodation_types_read", 'batch accommodation type read hardening'],
  ["alter policy batch_accommodation_room_pool_read", 'room pool read hardening'],
  ["alter policy enrollment_accommodation_assignments_read", 'assignment read hardening'],
  ["revoke all privileges on table public.accommodation_properties from authenticated", 'property least privilege reset'],
  ["grant select, insert, update on table public.accommodation_properties to authenticated", 'property least privilege grant'],
  ["revoke select on table public.v_batch_accommodation_inventory from anon", 'anonymous inventory view removal'],
  ["create or replace function public.get_course_management_workspace_v2", 'Course Management masking boundary'],
  ["- 'price_private'", 'private price mask'],
  ["- 'price_shared'", 'shared price mask'],
  ["- 'price_course_only'", 'course-only price mask'],
  ["- 'accommodation_capacity'", 'accommodation capacity mask'],
  ["- 'accommodation_remaining'", 'accommodation remaining mask'],
  ["- 'accommodation_note'", 'accommodation note mask'],
]) {
  has(migration, needle, label);
}

expect(
  (migration.match(/organization_has_capability\([^\n]+wellness_residential/g) ?? []).length >= 10,
  'residential canonical policies/boundaries must repeatedly enforce wellness_residential.',
);

for (const table of [
  'accommodation_properties',
  'accommodation_rooms',
  'batch_accommodation_types',
  'batch_accommodation_room_pool',
  'enrollment_accommodation_assignments',
]) {
  has(
    migration,
    `revoke all privileges on table public.${table} from authenticated`,
    `${table} authenticated privilege reset`,
  );
  has(
    migration,
    `grant select, insert, update on table public.${table} to authenticated`,
    `${table} SELECT/INSERT/UPDATE grant`,
  );
}

for (const forbiddenGrant of [
  'grant delete on table public.accommodation_',
  'grant truncate on table public.accommodation_',
  'grant trigger on table public.accommodation_',
  'grant references on table public.accommodation_',
  'grant delete on table public.batch_accommodation_',
  'grant truncate on table public.batch_accommodation_',
  'grant trigger on table public.batch_accommodation_',
  'grant references on table public.batch_accommodation_',
]) {
  expect(
    !migration.toLowerCase().includes(forbiddenGrant),
    `P3 must not restore broad authenticated privilege ${forbiddenGrant}`,
  );
}

for (const [needle, label] of [
  ['residentialEnabled: boolean', 'Education access residential state'],
  ['"wellness_residential"', 'session-bound residential capability lookup'],
  ['isWellnessResidentialEnabledForCurrentSession', 'residential session helper'],
]) {
  has(educationAccess, needle, label);
}

for (const [needle, label] of [
  ['isWellnessResidentialEnabledForCurrentSession', 'Course Management residential capability read'],
  ['residential-enabled', 'enabled Course Management surface state'],
  ['residential-disabled', 'disabled Course Management surface state'],
  ['data-wellness-residential', 'explicit Course Management residential surface marker'],
]) {
  has(courseLayout, needle, label);
}

for (const [needle, label] of [
  ['.course-management-scope.residential-disabled', 'disabled residential CSS scope'],
  ['> span:first-child', 'residential price-reference label hiding'],
]) {
  has(courseCss, needle, label);
}

// Existing accommodation mutation RPCs are intentionally latent/service-only.
for (const functionName of [
  'assign_enrollment_accommodation',
  'release_enrollment_accommodation',
  'set_batch_accommodation_availability',
  'upsert_accommodation_property',
  'upsert_accommodation_room',
  'upsert_batch_accommodation_room_pool',
  'upsert_batch_accommodation_type',
]) {
  has(
    latentRpcHardening,
    `revoke execute on function public.${functionName}`,
    `${functionName} authenticated execute revocation`,
  );
}

for (const forbiddenScope of [
  'insert into public.accommodation_properties',
  'insert into public.accommodation_rooms',
  'insert into public.batch_accommodation_types',
  'insert into public.batch_accommodation_room_pool',
  'insert into public.enrollment_accommodation_assignments',
  'billing',
  'subscription_plan',
]) {
  expect(
    !migration.toLowerCase().includes(forbiddenScope.toLowerCase()),
    `P3 migration must not fabricate residential data or drift into billing (${forbiddenScope})`,
  );
}

has(
  packageJson,
  'verify:r11-p3-residential-extension-gating-v1',
  'R11-P3 package verifier',
);

console.log('R11-P3 residential extension gating contracts verified.');
