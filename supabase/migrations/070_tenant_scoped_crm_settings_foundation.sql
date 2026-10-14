begin;

-- W8 Tenant Isolation: create organization-scoped CRM settings storage while
-- retaining the legacy global rows as immutable defaults during migration.
-- Existing organizations receive explicit copies so behavior does not change.

create table if not exists public.organization_lead_stage_probabilities (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  stage text not null,
  probability numeric(5,4) not null
    check (probability >= 0 and probability <= 1),
  updated_at timestamptz not null default now(),
  primary key (organization_id, stage)
);

create table if not exists public.organization_pipeline_stage_aging_rules (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  stage text not null,
  warning_after_days numeric(8,2) not null
    check (warning_after_days >= 0),
  stuck_after_days numeric(8,2) not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, stage),
  check (stuck_after_days >= warning_after_days)
);

create table if not exists public.organization_crm_settings_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  setting_group text not null,
  setting_key text not null,
  previous_value jsonb,
  new_value jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_org_crm_settings_audit_org_changed
  on public.organization_crm_settings_audit (organization_id, changed_at desc);

insert into public.organization_lead_stage_probabilities (
  organization_id,
  stage,
  probability,
  updated_at
)
select
  o.id,
  p.stage,
  p.probability,
  p.updated_at
from public.organizations o
cross join public.lead_stage_probabilities p
on conflict (organization_id, stage) do nothing;

insert into public.organization_pipeline_stage_aging_rules (
  organization_id,
  stage,
  warning_after_days,
  stuck_after_days,
  active,
  notes,
  created_at,
  updated_at
)
select
  o.id,
  r.stage,
  r.warning_after_days,
  r.stuck_after_days,
  r.active,
  r.notes,
  r.created_at,
  r.updated_at
from public.organizations o
cross join public.pipeline_stage_aging_rules r
on conflict (organization_id, stage) do nothing;

alter table public.organization_lead_stage_probabilities enable row level security;
alter table public.organization_pipeline_stage_aging_rules enable row level security;
alter table public.organization_crm_settings_audit enable row level security;

revoke all on table public.organization_lead_stage_probabilities
  from public, anon, authenticated;
revoke all on table public.organization_pipeline_stage_aging_rules
  from public, anon, authenticated;
revoke all on table public.organization_crm_settings_audit
  from public, anon, authenticated;

grant select on table public.organization_lead_stage_probabilities
  to authenticated;
grant select on table public.organization_pipeline_stage_aging_rules
  to authenticated;
grant select on table public.organization_crm_settings_audit
  to authenticated;

grant all on table public.organization_lead_stage_probabilities
  to service_role;
grant all on table public.organization_pipeline_stage_aging_rules
  to service_role;
grant all on table public.organization_crm_settings_audit
  to service_role;

drop policy if exists organization_lead_stage_probabilities_select
  on public.organization_lead_stage_probabilities;
create policy organization_lead_stage_probabilities_select
  on public.organization_lead_stage_probabilities
  for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists organization_pipeline_stage_aging_rules_select
  on public.organization_pipeline_stage_aging_rules;
create policy organization_pipeline_stage_aging_rules_select
  on public.organization_pipeline_stage_aging_rules
  for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists organization_crm_settings_audit_select
  on public.organization_crm_settings_audit;
create policy organization_crm_settings_audit_select
  on public.organization_crm_settings_audit
  for select to authenticated
  using (public.is_organization_member(organization_id));

commit;
