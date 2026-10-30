import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1k recovery verification failed: ${message}`);
  }
}

const baseline = read('supabase/recovery/032_integration_assets_baseline.sql');

for (const [needle, label] of [
  ['create table if not exists public.integration_assets', 'integration assets table'],
  ['references public.integration_connections(id)', 'connection FK'],
  ['references public.organizations(id)', 'organization FK'],
  ['integration_assets_connection_id_asset_type_external_id_key', 'asset uniqueness'],
  ['integration_assets_status_check', 'asset status invariant'],
  ["'google_ads_customer'::text", 'Google Ads asset type'],
  ["'meta_ad_account'::text", 'Meta Ads asset type'],
  ['create or replace function public.set_integration_child_organization()', 'child organization function'],
  ['integration_assets_set_organization', 'tenant derivation trigger'],
  ['trg_integration_assets_updated_at', 'updated-at trigger'],
  ['enable row level security', 'RLS'],
  ['create policy deny_direct_client_access', 'fail-closed policy'],
  ['using (false)', 'deny predicate'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only warning'],
  ['Never run it against current production.', 'production safety warning'],
]) {
  assert(baseline.includes(needle), `missing ${label}.`);
}

assert(
  !baseline.includes("'instagram_account'::text") &&
    !baseline.includes("'facebook_page'::text") &&
    !baseline.includes("'whatsapp_business_account'::text") &&
    !baseline.includes("'ga4_property'::text"),
  '032 recovery baseline must not claim later/unproven provider expansion.',
);

assert(
  !baseline.includes('insert into public.integration_assets'),
  'integration assets recovery must not copy production asset data.',
);

console.log('PH-5.2B.1k integration-assets recovery contract verified.');
