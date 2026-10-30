import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1j recovery verification failed: ${message}`);
  }
}

const geoBaseline = read('supabase/recovery/030_lead_geo_baseline.sql');
const followupsBaseline = read('supabase/recovery/030_followups_tenant_baseline.sql');
const baseline = read('supabase/recovery/030_sales_read_models_baseline.sql');

for (const [needle, label] of [
  ['add column if not exists geo_country text', 'lead geo country'],
  ['add column if not exists geo_region text', 'lead geo region'],
  ['add column if not exists geo_city text', 'lead geo city'],
  ['This file is NOT part of the normal production migration ledger.', 'geo recovery-only safety boundary'],
  ['Never run it against current production.', 'geo production safety warning'],
]) {
  assert(geoBaseline.includes(needle), `missing ${label}.`);
}

assert(
  !geoBaseline.includes('insert into public.'),
  'lead geo recovery baseline must not copy production data.',
);

for (const [needle, label] of [
  ['alter table public.tasks', 'tasks tenant table repair'],
  ['add column if not exists organization_id uuid', 'tasks organization column'],
  ['set organization_id = l.organization_id', 'tasks tenant backfill'],
  ['tasks_organization_id_fkey', 'tasks tenant FK'],
  ['references public.organizations(id)', 'tasks organization reference'],
  ['on delete restrict', 'tasks tenant delete restriction'],
  ['create or replace view public.v_followups_due', 'tenant-aware followups view'],
  ['with (security_invoker = true)', 'followups security invoker'],
  ['t.organization_id', 'followups tenant output'],
  ['l.organization_id = t.organization_id', 'tenant-safe task/lead join'],
  ['This file is NOT part of the normal production migration ledger.', 'followups recovery-only safety boundary'],
  ['Never run it against current production.', 'followups production safety warning'],
]) {
  assert(followupsBaseline.includes(needle), `missing ${label}.`);
}

assert(
  !followupsBaseline.includes('insert into public.'),
  'followups recovery baseline must not copy production data.',
);

for (const [needle, label] of [
  ['add column if not exists potential_value numeric', 'legacy lead potential value'],
  ['add column if not exists potential_currency text', 'legacy lead potential currency'],
  ['create or replace view public.v_lead_payment_totals', 'payment totals view'],
  ['create or replace view public.v_lead_revenue_status', 'lead revenue status view'],
  ['create or replace view public.v_paid_media_leads', 'paid-media compatibility view'],
  ['create or replace view public.v_paid_media_leads_ui', 'paid-media UI view'],
  ['create or replace view public.v_admissions_priority_queue', 'admissions priority queue'],
  ['with (security_invoker = true)', 'security-invoker posture'],
  ['organization_id', 'tenant column contract'],
  ['public.v_followups_due', 'existing follow-up dependency'],
  ['public.v_lead_journey_intelligence', 'existing journey dependency'],
  ['public.v_lead_revenue_status', 'revenue dependency'],
  ['public.v_paid_media_leads_ui', 'paid-media dependency'],
  ['null::numeric(14,2) as allocated_acquisition_cost', 'deferred acquisition cost metric'],
  ["'unavailable'::text as acquisition_cost_method", 'explicit unavailable acquisition method'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only safety boundary'],
  ['Never run it against current production.', 'production safety warning'],
]) {
  assert(baseline.includes(needle), `missing ${label}.`);
}

assert(
  !baseline.includes('insert into public.'),
  'recovery baseline must not copy production data.',
);

assert(
  !baseline.includes('google_ads_campaign_daily') &&
    !baseline.includes('meta_ads_campaign_daily') &&
    !baseline.includes('meta_ads_adset_daily') &&
    !baseline.includes('meta_ads_ad_daily'),
  '1j must not pull later ad-warehouse tables backward into the 030 boundary.',
);

for (const viewName of [
  'v_lead_payment_totals',
  'v_lead_revenue_status',
  'v_paid_media_leads',
  'v_paid_media_leads_ui',
  'v_admissions_priority_queue',
]) {
  assert(
    baseline.includes(`grant select on public.${viewName} to authenticated, service_role`),
    `missing least-privilege read grant for ${viewName}.`,
  );
}

console.log('PH-5.2B.1j sales/revenue/admissions recovery contracts verified.');
