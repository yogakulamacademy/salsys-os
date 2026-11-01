import fs from 'node:fs';

const route = fs.readFileSync('app/api/sync/course-batches/route.ts', 'utf8');
const registry = fs.readFileSync('lib/integrations/education-catalog.ts', 'utf8');
const yogakulamWrapper = fs.readFileSync(
  'lib/integrations/yogakulam-catalog-adapter.ts',
  'utf8',
);
const yogakulamEngine = fs.readFileSync(
  'lib/integrations/yogakulam-courses.ts',
  'utf8',
);
const migration = fs.readFileSync(
  'supabase/migrations/20261101183500_r11_p2_catalog_adapter_config_v1.sql',
  'utf8',
);
const healthMigration = fs.readFileSync(
  'supabase/migrations/20261027221500_course_catalog_sync_health_tenant_generic.sql',
  'utf8',
);
const packageJson = fs.readFileSync('package.json', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`R11-P2 verification failed: ${message}`);
}

function has(source, needle, label) {
  expect(source.includes(needle), `missing ${label} (${needle})`);
}

for (const [needle, label] of [
  ['syncEducationCatalog', 'generic catalog sync runner'],
  ['EducationCatalogSyncConfigurationError', 'configuration fail-closed error'],
  ['capability_code", "education_catalog_sync"', 'catalog-sync capability lookup'],
  ['.eq("enabled", true)', 'enabled capability requirement'],
  ['capability_code", "education_core"', 'Education Core dependency check'],
  ['CATALOG_SYNC_CAPABILITY_NOT_CONFIGURED', 'disabled/missing capability failure'],
  ['CATALOG_SYNC_ORGANIZATION_REQUIRED', 'multi-tenant explicit-target boundary'],
  ['CATALOG_SYNC_PROVIDER_NOT_CONFIGURED', 'missing provider failure'],
  ['CATALOG_SYNC_PROVIDER_UNSUPPORTED', 'unsupported provider failure'],
  ['yogakulam_website: syncYogakulamCatalogAdapter', 'Yogakulam registry entry'],
]) {
  has(registry, needle, label);
}

for (const [needle, label] of [
  ['syncEducationCatalog({', 'route generic dispatch'],
  ['organization_id', 'optional explicit organization target'],
  ['requestedOrganizationId(request)', 'route target resolver'],
  ['configurationFailure(error)', 'route configuration error handling'],
]) {
  has(route, needle, label);
}

expect(
  !route.includes('syncYogakulamCourseCatalog'),
  'sync route must not bypass the adapter registry.',
);
expect(
  !route.includes('yogakulam-courses'),
  'sync route must not import the Yogakulam engine directly.',
);

for (const [needle, label] of [
  ['organization_sites', 'provider hostname-to-tenant verification'],
  ['YOGAKULAM_COURSE_FEED_URL', 'provider-specific feed configuration'],
  ['CATALOG_SYNC_PROVIDER_TENANT_MISMATCH', 'cross-tenant mismatch guard'],
  ['await assertFeedBelongsToOrganization(organizationId)', 'tenant guard before delegation'],
  ['syncYogakulamCourseCatalog({ trigger })', 'delegation to proven Yogakulam engine'],
]) {
  has(yogakulamWrapper, needle, label);
}

for (const [needle, label] of [
  ['const SOURCE_SYSTEM = "yogakulam_website"', 'stable Yogakulam source-system identity'],
  ['const COURSE_CODE_MAP', 'existing Yogakulam course parser map'],
  ['course_catalog_sync_runs', 'existing tenant-scoped sync ledger'],
  ['finalize_course_catalog_sync', 'existing finalization path'],
]) {
  has(yogakulamEngine, needle, label);
}

for (const [needle, label] of [
  ["code = 'education_catalog_sync'", 'catalog sync capability row'],
  ['config_schema_version = 2', 'provider-aware config schema version'],
  ["o.slug = 'yogakulam-academy'", 'stable Yogakulam organization selection'],
  ["'yogakulam_website'", 'non-secret provider config'],
  ['R11_P2_UNEXPECTED_EXISTING_PROVIDER', 'unexpected provider drift guard'],
  ['R11_P2_PROVIDER_CONFIG_UPDATE_COUNT', 'single-row provider update assertion'],
]) {
  has(migration, needle, label);
}

for (const forbidden of [
  'insert into public.courses',
  'update public.courses',
  'delete from public.courses',
  'insert into public.course_batches',
  'update public.course_batches',
  'delete from public.course_batches',
  'insert into public.enrollments',
  'update public.enrollments',
  'delete from public.enrollments',
  'insert into public.course_catalog_sync_runs',
  'update public.course_catalog_sync_runs',
  'delete from public.course_catalog_sync_runs',
  'wellness_residential',
]) {
  expect(
    !migration.toLowerCase().includes(forbidden.toLowerCase()),
    `P2 provider-config migration must not mutate business/P3 state (${forbidden})`,
  );
}

for (const forbiddenSecretKey of [
  'config.secret',
  'config.token',
  'config.password',
  'config.api_key',
  'config.apiKey',
  'config.credential',
]) {
  expect(
    !registry.includes(forbiddenSecretKey) && !yogakulamWrapper.includes(forbiddenSecretKey),
    `capability config must not be used as a provider-secret store (${forbiddenSecretKey})`,
  );
}

has(
  healthMigration,
  'distinct on (r.organization_id,r.source_system)',
  'tenant/source-scoped sync health',
);
has(
  healthMigration,
  'where cb.organization_id=r.organization_id',
  'tenant-scoped batch health evidence',
);

has(
  packageJson,
  'verify:r11-p2-catalog-adapter-boundary-v1',
  'R11-P2 verifier package script',
);

console.log('R11-P2 catalog adapter boundary contracts verified.');
