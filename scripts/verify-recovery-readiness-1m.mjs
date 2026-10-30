import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1m recovery verification failed: ${message}`);
  }
}

const warehouse = read('supabase/recovery/040_paid_media_warehouse_baseline.sql');
const readModels = read('supabase/recovery/040_campaigns_read_models_baseline.sql');

for (const table of [
  'google_ads_sync_runs',
  'google_ads_campaign_daily',
  'google_ads_keyword_daily',
  'google_ads_search_term_daily',
  'google_ads_geo_daily',
  'google_ads_device_daily',
  'meta_ads_sync_runs',
  'meta_ads_campaign_daily',
  'meta_ads_adset_daily',
  'meta_ads_ad_daily',
]) {
  assert(
    warehouse.includes(`create table if not exists public.${table}`),
    `missing ${table} warehouse table.`,
  );
}

for (const [needle, label] of [
  ['create or replace function public.google_ads_set_updated_at()', 'Google Ads updated-at helper'],
  ['create or replace function public.meta_ads_set_updated_at()', 'Meta Ads updated-at helper'],
  ['references public.organizations(id) on delete restrict', 'tenant organization foreign keys'],
  ['references public.google_ads_sync_runs(id) on delete set null', 'Google sync-run foreign keys'],
  ['references public.meta_ads_sync_runs(id) on delete set null', 'Meta sync-run foreign keys'],
  ['uq_google_ads_campaign_daily_org', 'Google campaign tenant uniqueness'],
  ['uq_google_ads_keyword_daily_org', 'Google keyword tenant uniqueness'],
  ['uq_google_ads_search_term_daily_org', 'Google search-term tenant uniqueness'],
  ['uq_google_ads_geo_daily_org', 'Google geo tenant uniqueness'],
  ['uq_google_ads_device_daily_org', 'Google device tenant uniqueness'],
  ['uq_meta_ads_campaign_daily_org', 'Meta campaign tenant uniqueness'],
  ['uq_meta_ads_adset_daily_org', 'Meta ad-set tenant uniqueness'],
  ['uq_meta_ads_ad_daily_org', 'Meta ad tenant uniqueness'],
  ['enable row level security', 'RLS enablement'],
  ['public.is_organization_member(organization_id)', 'tenant membership policy'],
  ['public.is_crm_user() and public.is_organization_member(organization_id)', 'Meta CRM-user tenant policy'],
  ['revoke all on table public.%I from public, anon, authenticated, service_role', 'explicit privilege reset'],
  ['grant select on table public.%I to authenticated', 'authenticated read grants'],
  ['grant all on table public.%I to service_role', 'service-role worker grants'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only warning'],
  ['Never run it against current production.', 'production safety warning'],
]) {
  assert(warehouse.includes(needle), `missing ${label}.`);
}

assert(
  !warehouse.includes('connection_id uuid') &&
    !warehouse.includes('integration_asset_id uuid'),
  '040 warehouse recovery must not pull unproven sync-run integration references backward.',
);

for (const fn of [
  'campaign_workspace_json_text',
  'campaign_workspace_json_numeric',
]) {
  assert(
    readModels.includes(`create or replace function public.${fn}`),
    `missing ${fn} helper.`,
  );
}

for (const view of [
  'v_google_ads_reporting_window',
  'v_google_ads_lead_campaign_attribution',
  'v_google_ads_lead_revenue',
  'v_google_ads_campaign_crm_30d',
  'v_meta_ads_reporting_window',
  'v_meta_ads_lead_attribution',
  'v_meta_ads_lead_revenue',
  'v_meta_ads_campaign_crm_30d',
]) {
  assert(
    readModels.includes(`create or replace view public.${view}`),
    `missing ${view} read model.`,
  );
}

assert(
  (readModels.match(/with \(security_invoker = true\)/g) ?? []).length >= 8,
  'all eight Campaigns prerequisite views must be SECURITY INVOKER.',
);

assert(
  !warehouse.toLowerCase().includes('insert into public.google_ads_') &&
    !warehouse.toLowerCase().includes('insert into public.meta_ads_') &&
    !readModels.toLowerCase().includes('insert into '),
  '1m recovery must not copy production ad or CRM data.',
);

console.log('PH-5.2B.1m Campaigns / paid-media recovery contract verified.');
