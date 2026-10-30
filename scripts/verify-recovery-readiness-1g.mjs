import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PH-5.2B.1g recovery verification failed: ${message}`);
  }
}

const payment = read('supabase/recovery/017_payments_tenant_baseline.sql');
const journeySource = read('supabase/recovery/018_person_journey_source_baseline.sql');
const leadsWorkspace = read('supabase/recovery/019_leads_workspace_baseline.sql');
const evidence = read('docs/checkpoints/PH-5.2B.1g-replay-evidence.md');

for (const [needle, label] of [
  ['alter table public.payments', 'payments table repair'],
  ['add column if not exists organization_id uuid', 'payments organization column'],
  ['set organization_id = l.organization_id', 'payments organization backfill'],
  ['where l.id = p.lead_id', 'payments lead join'],
  ['017 recovery abort: payments contains rows whose organization cannot be resolved from lead_id', 'payments fail-closed guard'],
  ['alter column organization_id set not null', 'payments NOT NULL contract'],
  ['add constraint payments_organization_id_fkey', 'payments organization FK'],
  ['references public.organizations(id)', 'payments organization FK target'],
  ['on delete restrict', 'payments FK delete behavior'],
  ['NOT part of the normal production migration ledger', 'payments recovery-only boundary'],
]) {
  assert(payment.includes(needle), `017 payments baseline missing ${label}.`);
}

assert(!payment.includes('insert into public.payments'), '017 baseline must not invent payment data.');
assert(!payment.includes('create policy'), '017 baseline must not pull later payment RLS policy changes backward.');

for (const [needle, label] of [
  ['alter table public.touchpoints', 'touchpoint geo repair'],
  ['geo_country text', 'geo country column'],
  ['geo_region text', 'geo region column'],
  ['geo_city text', 'geo city column'],
  ['alter table public.web_sessions', 'web-session geo repair'],
  ['geo_timezone text', 'geo timezone column'],
  ['alter table public.leads', 'lead source repair'],
  ['lead_origin text', 'lead origin column'],
  ['first_touch_source text', 'first-touch source column'],
  ['first_touch_medium text', 'first-touch medium column'],
  ['first_touch_campaign text', 'first-touch campaign column'],
  ['NOT part of the normal production migration ledger', '018 recovery-only boundary'],
]) {
  assert(journeySource.includes(needle), `018 journey-source baseline missing ${label}.`);
}

assert(!journeySource.includes('insert into '), '018 baseline must not invent application data.');
assert(!journeySource.includes('create index'), '018 baseline must not pull later performance indexes backward.');
assert(!journeySource.includes('create trigger'), '018 baseline must not add unrelated triggers.');

for (const [needle, label] of [
  ['create table if not exists public.pipeline_stage_aging_rules', 'default stage-aging rules table'],
  ['create table if not exists public.organization_pipeline_stage_aging_rules', 'tenant stage-aging rules table'],
  ['primary key (organization_id, stage)', 'tenant stage-aging primary key'],
  ['references public.organizations(id) on delete cascade', 'tenant rule organization FK'],
  ['enable row level security', 'stage-aging RLS'],
  ['using (public.is_organization_member(organization_id))', 'tenant rule membership policy'],
  ['using (public.is_crm_user())', 'default rule CRM-read policy'],
  ['with check (public.can_write_crm())', 'default rule write authorization'],
  ['pipeline_stage_aging_rules_set_updated_at', 'default rule updated-at trigger'],
  ['create or replace view public.v_pipeline_stage_aging', 'pipeline stage-aging view'],
  ['with (security_invoker = true)', 'security-invoker view posture'],
  ['create or replace view public.v_leads_overview', 'Leads overview compatibility view'],
  ['l.organization_id', 'Leads overview tenant output'],
  ['No production configuration rows are copied here', 'schema-only configuration boundary'],
  ['NOT part of the normal production migration ledger', '019 recovery-only boundary'],
]) {
  assert(leadsWorkspace.includes(needle), `019 Leads workspace baseline missing ${label}.`);
}

assert(!leadsWorkspace.includes('insert into public.pipeline_stage_aging_rules'), '019 baseline must not copy production default-rule configuration data.');
assert(!leadsWorkspace.includes('insert into public.organization_pipeline_stage_aging_rules'), '019 baseline must not copy tenant rule configuration data.');

const leadsViewIndex = leadsWorkspace.indexOf('create or replace view public.v_leads_overview');
const organizationOutputIndex = leadsWorkspace.indexOf('l.organization_id', leadsViewIndex);
assert(leadsViewIndex >= 0 && organizationOutputIndex > leadsViewIndex, '019 baseline must append organization_id in the Leads overview compatibility definition.');

for (const [needle, label] of [
  ['migration `016_journey_workspace_hardening` applied successfully in full', 'full migration 016 replay evidence'],
  ['migration `017_person_360` applied successfully', 'migration 017 replay evidence'],
  ['migration `018_person_journey` applied successfully', 'migration 018 replay evidence'],
  ['migration `019_leads_workspace_tenant_scope` applied successfully', 'migration 019 replay evidence'],
  ['public.v_attribution_lead_facts is required', 'next migration 020 boundary'],
  ['The disposable Supabase branch was deleted', 'disposable branch cleanup evidence'],
  ['Production schema/data were not changed', 'production safety evidence'],
]) {
  assert(evidence.includes(needle), `1g replay evidence missing ${label}.`);
}

console.log('PH-5.2B.1g payments, journey-source, Leads workspace, replay-evidence, and recovery-only safety contracts verified.');
