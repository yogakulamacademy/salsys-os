import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1h recovery verification failed: ${message}`);
  }
}

const sourceBaseline = read('supabase/recovery/018_person_journey_source_baseline.sql');
const attributionBaseline = read('supabase/recovery/020_attribution_views_baseline.sql');

for (const column of [
  'last_touch_source text',
  'last_touch_medium text',
  'last_touch_campaign text',
]) {
  assert(sourceBaseline.includes(column), `missing ${column} prerequisite.`);
}

for (const [needle, label] of [
  ['create or replace view public.v_attribution_lead_facts', 'lead-facts view'],
  ['create or replace view public.v_attribution_model_rows', 'model-rows view'],
  ['with (security_invoker = true)', 'security-invoker posture'],
  ['from public.payments p', 'payment dependency'],
  ['from public.enrollments e', 'enrollment dependency'],
  ['left join public.lead_attribution la', 'lead-attribution dependency'],
  ['left join public.touchpoints conversion_tp', 'conversion touchpoint dependency'],
  ['f.first_touch_source', 'first-touch model input'],
  ['f.last_touch_source', 'last-touch model input'],
  ['This file is NOT part of the normal production migration ledger.', 'recovery-only safety boundary'],
]) {
  assert(attributionBaseline.includes(needle), `missing ${label}.`);
}

assert(
  !attributionBaseline.includes('organization_id as organization_id') &&
    !attributionBaseline.includes('f.organization_id'),
  'pre-020 attribution baseline must not pull the tenant column backward; migration 020 appends it.',
);

assert(
  !attributionBaseline.includes('grant ') &&
    !attributionBaseline.includes('create function public.get_attribution_workspace'),
  'pre-020 attribution baseline must not invent workspace RPC grants or later API surface.',
);

const leadFacts = attributionBaseline.indexOf('create or replace view public.v_attribution_lead_facts');
const modelRows = attributionBaseline.indexOf('create or replace view public.v_attribution_model_rows');
assert(
  leadFacts >= 0 && modelRows > leadFacts,
  'v_attribution_lead_facts must be created before v_attribution_model_rows.',
);

console.log('PH-5.2B.1h attribution recovery contracts verified.');
