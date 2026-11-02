-- PH-5.2B.1g — cold-recovery compatibility only.
-- Reconstructs the historical read-model/configuration schema expected by
-- migration 019_leads_workspace_tenant_scope.
--
-- No production configuration rows are copied here. This is schema/read-model
-- compatibility only. This file is NOT part of the normal production migration ledger.

create table if not exists public.pipeline_stage_aging_rules (
  stage text primary key,
  warning_after_days numeric not null check (warning_after_days >= 0),
  stuck_after_days numeric not null check (stuck_after_days >= warning_after_days),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_pipeline_stage_aging_rules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stage text not null,
  warning_after_days numeric not null check (warning_after_days >= 0),
  stuck_after_days numeric not null check (stuck_after_days >= warning_after_days),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, stage)
);

alter table public.pipeline_stage_aging_rules enable row level security;
alter table public.organization_pipeline_stage_aging_rules enable row level security;

drop policy if exists pipeline_stage_aging_rules_read on public.pipeline_stage_aging_rules;
create policy pipeline_stage_aging_rules_read
on public.pipeline_stage_aging_rules
for select to authenticated
using (public.is_crm_user());

drop policy if exists pipeline_stage_aging_rules_insert on public.pipeline_stage_aging_rules;
create policy pipeline_stage_aging_rules_insert
on public.pipeline_stage_aging_rules
for insert to authenticated
with check (public.can_write_crm());

drop policy if exists pipeline_stage_aging_rules_update on public.pipeline_stage_aging_rules;
create policy pipeline_stage_aging_rules_update
on public.pipeline_stage_aging_rules
for update to authenticated
using (public.can_write_crm())
with check (public.can_write_crm());

drop policy if exists organization_pipeline_stage_aging_rules_select on public.organization_pipeline_stage_aging_rules;
create policy organization_pipeline_stage_aging_rules_select
on public.organization_pipeline_stage_aging_rules
for select to authenticated
using (public.is_organization_member(organization_id));

revoke all on table public.organization_pipeline_stage_aging_rules from public, anon, authenticated;
grant select on table public.organization_pipeline_stage_aging_rules to authenticated;
grant all on table public.organization_pipeline_stage_aging_rules to service_role;

grant select on table public.pipeline_stage_aging_rules to authenticated;
grant all on table public.pipeline_stage_aging_rules to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.pipeline_stage_aging_rules'::regclass
      and tgname = 'pipeline_stage_aging_rules_set_updated_at'
      and not tgisinternal
  ) then
    create trigger pipeline_stage_aging_rules_set_updated_at
    before update on public.pipeline_stage_aging_rules
    for each row execute function public.set_updated_at();
  end if;
end
$$;

create or replace view public.v_pipeline_stage_aging
with (security_invoker = true)
as
with current_stage_entry as (
  select
    l0.id as lead_id,
    coalesce(
      (
        select lsh.changed_at
        from public.lead_stage_history lsh
        where lsh.lead_id = l0.id
          and lsh.to_stage::text = l0.current_stage::text
        order by lsh.changed_at desc, lsh.id desc
        limit 1
      ),
      l0.created_at
    ) as stage_entered_at
  from public.leads l0
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(nullif(btrim(l.display_name), ''), nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), l.lead_code) as lead_name,
  l.current_stage::text as current_stage,
  l.status::text as lead_status,
  l.intent::text as intent,
  l.owner_user_id,
  p.full_name as owner_name,
  l.interested_course_id,
  c.code as course_code,
  c.name as course_name,
  l.preferred_batch_id,
  cb.batch_code,
  cb.location as batch_location,
  cb.start_date as batch_start_date,
  cb.end_date as batch_end_date,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.lead_creation_channel::text as lead_creation_channel,
  l.current_contact_channel::text as current_contact_channel,
  l.last_contacted_at,
  l.next_followup_at,
  l.last_inbound_at,
  l.last_outbound_at,
  l.created_at as lead_created_at,
  cse.stage_entered_at,
  greatest(extract(epoch from now() - cse.stage_entered_at) / 3600.0, 0::numeric)::numeric(12,2) as stage_age_hours,
  greatest(extract(epoch from now() - cse.stage_entered_at) / 86400.0, 0::numeric)::numeric(12,2) as stage_age_days,
  coalesce(tenant_rule.warning_after_days, default_rule.warning_after_days) as warning_after_days,
  coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days) as stuck_after_days,
  case
    when coalesce(tenant_rule.stage, default_rule.stage) is null or coalesce(tenant_rule.active, default_rule.active) is not true then 'untracked'::text
    when (extract(epoch from now() - cse.stage_entered_at) / 86400.0) >= coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days) then 'stuck'::text
    when (extract(epoch from now() - cse.stage_entered_at) / 86400.0) >= coalesce(tenant_rule.warning_after_days, default_rule.warning_after_days) then 'warning'::text
    else 'healthy'::text
  end as aging_status,
  case
    when coalesce(tenant_rule.stage, default_rule.stage) is null or coalesce(tenant_rule.active, default_rule.active) is not true then null::numeric
    when (extract(epoch from now() - cse.stage_entered_at) / 86400.0) >= coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days)
      then greatest(extract(epoch from now() - cse.stage_entered_at) / 86400.0 - coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days), 0::numeric)::numeric(12,2)
    else 0::numeric(12,2)
  end as days_over_stuck_threshold,
  case
    when l.last_contacted_at is null then null::numeric
    else greatest(extract(epoch from now() - l.last_contacted_at) / 86400.0, 0::numeric)::numeric(12,2)
  end as days_since_last_contact
from public.leads l
join current_stage_entry cse on cse.lead_id = l.id
left join public.organization_pipeline_stage_aging_rules tenant_rule
  on tenant_rule.organization_id = l.organization_id
 and tenant_rule.stage = l.current_stage::text
left join public.pipeline_stage_aging_rules default_rule
  on default_rule.stage = l.current_stage::text
left join public.profiles p on p.id = l.owner_user_id
left join public.courses c on c.id = l.interested_course_id
left join public.course_batches cb on cb.id = l.preferred_batch_id;

-- Preserve the existing v_leads_overview column order and append organization_id
-- as the final column, which is the exact contract migration 019 checks for.
create or replace view public.v_leads_overview
with (security_invoker = true)
as
select
  l.id,
  l.lead_code,
  coalesce(l.display_name, trim(concat_ws(' ', l.first_name, l.last_name)), l.lead_code) as lead_name,
  l.current_stage,
  l.status,
  l.intent,
  c.name as course_name,
  l.preferred_location,
  l.preferred_month,
  l.country,
  l.lead_creation_channel,
  l.current_contact_channel,
  la.first_touch_source,
  la.first_touch_medium,
  la.first_touch_campaign,
  l.owner_user_id,
  l.next_followup_at,
  l.last_contacted_at,
  l.created_at,
  l.first_name,
  l.last_name,
  l.display_name,
  l.interested_course_id,
  l.preferred_batch_id,
  l.preferred_mode,
  l.timezone,
  l.language,
  la.last_touch_source,
  la.last_touch_medium,
  la.last_touch_campaign,
  p.full_name as owner_name,
  l.first_contacted_at,
  l.last_inbound_at,
  l.last_outbound_at,
  l.summary,
  l.notes,
  l.updated_at,
  la.lead_creation_source,
  la.lead_creation_medium,
  la.lead_creation_campaign,
  la.conversion_source,
  la.conversion_medium,
  la.conversion_campaign,
  la.first_marketing_touchpoint_id,
  la.last_marketing_touchpoint_id,
  l.organization_id
from public.leads l
left join public.courses c on c.id = l.interested_course_id
left join public.lead_attribution la on la.lead_id = l.id
left join public.profiles p on p.id = l.owner_user_id;
