-- Cold-recovery compatibility only.
--
-- These legacy global CRM settings authorization helpers existed out-of-band
-- before tenant-aware compatibility reads began using them at 20261014060716.
-- No creator migration is present in the production ledger. Stage only in the
-- ephemeral clean replay database; never apply to current production.

begin;

create or replace function public.can_manage_crm_settings()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    session_user in ('postgres', 'supabase_admin')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role::text in ('admin', 'manager')
    );
$function$;

create or replace function public.can_read_crm_settings()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    session_user in ('postgres', 'supabase_admin')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
    );
$function$;

revoke all on function public.can_manage_crm_settings() from public, anon;
revoke all on function public.can_read_crm_settings() from public, anon;

grant execute on function public.can_manage_crm_settings() to authenticated, service_role;
grant execute on function public.can_read_crm_settings() to authenticated, service_role;

-- v_pipeline_stage_aging_summary exists in production but has no creator in
-- either the production migration ledger or the source migration history.
-- The authoritative v_pipeline_stage_aging view is recreated immediately before
-- this recovery boundary by 20261014055802, so reconstruct the live summary
-- contract here without modifying that historical production migration.
create or replace view public.v_pipeline_stage_aging_summary
with (security_invoker = true)
as
select
  current_stage,
  count(*) as total_leads,
  count(*) filter (where aging_status = 'healthy'::text) as healthy_leads,
  count(*) filter (where aging_status = 'warning'::text) as warning_leads,
  count(*) filter (where aging_status = 'stuck'::text) as stuck_leads,
  count(*) filter (where aging_status = 'untracked'::text) as untracked_leads,
  round(avg(stage_age_days), 2) as average_stage_age_days,
  round(
    percentile_cont(0.5::double precision)
      within group (order by stage_age_days::double precision)::numeric,
    2
  ) as median_stage_age_days,
  round(max(stage_age_days), 2) as oldest_stage_age_days
from public.v_pipeline_stage_aging
where current_stage <> all(array[
  'enrolled'::text,
  'lost'::text,
  'unqualified'::text,
  'duplicate'::text
])
group by current_stage;

-- Production currently has a constraint-backed UNIQUE key on
-- organization_members(organization_id,user_id), and the workspace membership
-- FK depends on that constraint's backing index. No migration in the production
-- ledger creates the constraint, while migration 007 creates only the older
-- standalone organization_members_org_user_unique index. Reconstruct the
-- missing dependency graph before the later duplicate-index cleanup runs.
--
-- Temporarily remove the FK and standalone index so PostgreSQL cannot bind the
-- FK back to the obsolete index. Then create the constraint-backed key, recreate
-- the FK, and finally recreate the historical duplicate index. The real Oct-27
-- cleanup migration can then drop that duplicate normally, matching production.
alter table public.workspace_memberships
  drop constraint if exists workspace_memberships_org_user_fkey;

drop index if exists public.organization_members_org_user_unique;

do $recovery$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_organization_id_user_id_key'
      and contype = 'u'
  ) then
    alter table public.organization_members
      add constraint organization_members_organization_id_user_id_key
      unique (organization_id, user_id);
  end if;
end;
$recovery$;

alter table public.workspace_memberships
  add constraint workspace_memberships_org_user_fkey
  foreign key (organization_id, user_id)
  references public.organization_members(organization_id, user_id)
  on delete cascade;

create unique index if not exists organization_members_org_user_unique
  on public.organization_members(organization_id, user_id);

commit;
