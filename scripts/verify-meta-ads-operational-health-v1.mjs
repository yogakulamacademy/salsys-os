import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261029114500_meta_ads_operational_health_v1.sql',
  'utf8',
);

function requireText(needle, label) {
  if (!migration.includes(needle)) {
    throw new Error(`Meta Ads operational health verification failed: missing ${label} (${needle})`);
  }
}

for (const [needle, label] of [
  ['v_meta_ads_operational_health_v1', 'Meta Ads operational health view'],
  ['security_invoker = true', 'security invoker mode'],
  ["ic.provider = 'meta'", 'Meta provider scope'],
  ["array['ads_read','ads_management']", 'Ads permission scope check'],
  ["scope_row->>'scope' in ('ads_read','ads_management')", 'granular Ads permission check'],
  ["'configuration_blocked'::text", 'configuration-blocked state'],
  ["'runtime_failure'::text", 'runtime-failure state'],
  ["'stale'::text", 'stale state'],
  ["'meta_ads_permission_missing'::text", 'missing permission blocker code'],
  ["'meta_ad_account_not_selected'::text", 'missing selected account blocker code'],
  ['selected_asset_count', 'selected asset count'],
  ['v_meta_ads_sync_health', 'existing sync-health source'],
  ['revoke all on public.v_meta_ads_operational_health_v1', 'direct read revocation'],
  ['from public, anon, authenticated', 'anon/authenticated revocation'],
  ['grant select on public.v_meta_ads_operational_health_v1', 'service-role grant'],
  ['to service_role', 'service-role reader'],
]) {
  requireText(needle, label);
}

const lower = migration.toLowerCase();
for (const forbidden of [
  'drop view',
  'drop table',
  'delete from',
  'update public.',
  'insert into public.',
  'alter table',
]) {
  if (lower.includes(forbidden)) {
    throw new Error(`Meta Ads operational health must remain additive/read-only: ${forbidden}`);
  }
}

const missingPermissionIndex = migration.indexOf("j.ads_permission_present = false");
const missingAssetIndex = migration.indexOf('j.selected_asset_count = 0');
if (missingPermissionIndex < 0 || missingAssetIndex < 0 || missingPermissionIndex > missingAssetIndex) {
  throw new Error('Missing Ads permission must be classified before the secondary no-selected-asset blocker.');
}

console.log('Meta Ads operational health V1 contracts verified.');
