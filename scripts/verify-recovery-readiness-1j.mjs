import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1j recovery verification failed: ${message}`);
  }
}

const baseline = read('supabase/recovery/030_sales_read_models_baseline.sql');

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
