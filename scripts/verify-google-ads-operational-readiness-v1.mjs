import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261101141500_google_ads_operational_readiness_v1.sql',
  'utf8',
);
const readiness = fs.readFileSync(
  'app/system-health/operational-readiness-section.tsx',
  'utf8',
);

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(
      `Google Ads operational readiness verification failed: missing ${label} (${needle})`,
    );
  }
}

for (const [needle, label] of [
  ['v_google_ads_operational_readiness_v1', 'Google Ads readiness view'],
  ['security_invoker = true', 'security invoker mode'],
  ["ic.provider = 'google'", 'Google provider scope'],
  ["'https://www.googleapis.com/auth/adwords'", 'Google Ads OAuth scope check'],
  ["ia.asset_type = 'google_ads_customer'", 'Google Ads customer asset scope'],
  ['v_google_ads_sync_health', 'existing raw Google Ads sync-health source'],
  ['CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION', 'production-access provider error'],
  ["'google_cloud_project_test_access'::text", 'test-access blocker code'],
  ["'configuration_blocked'::text", 'configuration-blocked state'],
  ["'runtime_failure'::text", 'runtime-failure state'],
  ["'stale'::text", 'stale state'],
  ['selected_asset_count', 'selected asset count'],
  ['revoke all on public.v_google_ads_operational_readiness_v1', 'direct read revocation'],
  ['from public, anon, authenticated', 'anon/authenticated revocation'],
  ['grant select on public.v_google_ads_operational_readiness_v1', 'service-role grant'],
  ['to service_role', 'service-role reader'],
]) {
  requireText(migration, needle, label);
}

for (const [needle, label] of [
  ['.from("v_google_ads_operational_readiness_v1")', 'System Health Google Ads readiness read'],
  ['Google Ads readiness is temporarily unavailable.', 'fail-closed Google readiness load warning'],
]) {
  requireText(readiness, needle, label);
}

const tenantScopes =
  readiness.match(/\.eq\("organization_id", organizationId\)/g)?.length ?? 0;
if (tenantScopes < 3) {
  throw new Error(
    'Operational Readiness must keep base, Google Ads, and commerce service-role reads explicitly tenant-scoped.',
  );
}

const lower = migration.toLowerCase();
for (const forbidden of [
  'drop view',
  'drop table',
  'delete from',
  'update public.',
  'insert into public.',
  'alter table',
  'create or replace view public.v_system_health',
]) {
  if (lower.includes(forbidden)) {
    throw new Error(
      `Google Ads readiness must remain additive/read-only and preserve raw System Health: ${forbidden}`,
    );
  }
}

const missingScopeIndex = migration.indexOf('j.adwords_scope_present = false');
const missingAssetIndex = migration.indexOf('j.selected_asset_count = 0');
const providerBlockIndex = migration.indexOf('CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION');
const runtimeFailureIndex = migration.indexOf(
  "when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error') then 'runtime_failure'::text",
);

if (
  missingScopeIndex < 0 ||
  missingAssetIndex < 0 ||
  providerBlockIndex < 0 ||
  runtimeFailureIndex < 0 ||
  missingScopeIndex > missingAssetIndex ||
  missingAssetIndex > providerBlockIndex ||
  providerBlockIndex > runtimeFailureIndex
) {
  throw new Error(
    'Google Ads readiness precedence must remain: connection/scope/asset configuration, known provider-access blocker, then generic runtime failure.',
  );
}

console.log('Google Ads operational readiness V1 contracts verified.');
