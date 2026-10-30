import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1l recovery verification failed: ${message}`);
  }
}

const baseline = read('supabase/recovery/039_analytics_seo_warehouse_baseline.sql');

const tables = [
  'ga4_daily',
  'ga4_source_medium_daily',
  'ga4_landing_page_daily',
  'ga4_campaign_daily',
  'ga4_country_daily',
  'ga4_sync_runs',
  'gsc_sync_runs',
  'gsc_daily',
  'gsc_query_daily',
  'gsc_page_daily',
  'gsc_country_daily',
  'gsc_device_daily',
  'gsc_search_appearance_daily',
];

for (const table of tables) {
  assert(
    baseline.includes(`create table if not exists public.${table}`),
    `missing ${table} recovery table.`,
  );
}

for (const [needle, label] of [
  ['references public.organizations(id) on delete restrict', 'tenant organization foreign keys'],
  ['uq_ga4_daily_org', 'GA4 tenant uniqueness'],
  ['uq_ga4_source_medium_daily_org', 'GA4 source tenant uniqueness'],
  ['uq_ga4_landing_page_daily_org', 'GA4 landing tenant uniqueness'],
  ['uq_ga4_campaign_daily_org', 'GA4 campaign tenant uniqueness'],
  ['uq_ga4_country_daily_org', 'GA4 country tenant uniqueness'],
  ['uq_gsc_daily_org', 'GSC daily tenant uniqueness'],
  ['uq_gsc_query_daily_org', 'GSC query tenant uniqueness'],
  ['uq_gsc_page_daily_org', 'GSC page tenant uniqueness'],
  ['uq_gsc_country_daily_org', 'GSC country tenant uniqueness'],
  ['uq_gsc_device_daily_org', 'GSC device tenant uniqueness'],
  ['uq_gsc_search_appearance_daily_org', 'GSC appearance tenant uniqueness'],
  ['references public.gsc_sync_runs(id) on delete set null', 'GSC sync-run foreign keys'],
  ['trg_gsc_daily_updated_at', 'GSC updated-at trigger'],
  ['enable row level security', 'RLS enablement'],
  ['for select to authenticated using (public.is_organization_member(organization_id))', 'tenant-scoped authenticated read policy'],
  ['revoke all on table public.%I from public, anon, authenticated, service_role', 'explicit Data API privilege reset'],
  ['grant select on table public.%I to authenticated', 'authenticated read grant'],
  ['grant all on table public.%I to service_role', 'service-role worker grant'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only warning'],
  ['Never run it against current production.', 'production safety warning'],
]) {
  assert(baseline.includes(needle), `missing ${label}.`);
}

assert(
  !baseline.includes('connection_id uuid') &&
    !baseline.includes('integration_asset_id uuid'),
  '039 recovery must not pull unproven later sync-run integration references backward.',
);

assert(
  !baseline.includes('insert into public.ga4_') &&
    !baseline.includes('insert into public.gsc_'),
  'analytics/SEO recovery must not copy production warehouse data.',
);

console.log('PH-5.2B.1l analytics/SEO warehouse recovery contract verified.');
