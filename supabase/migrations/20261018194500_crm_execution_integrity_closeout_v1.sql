-- R3 CRM Sales Execution integrity closeout v1
-- Keeps lead ownership and follow-up cache consistent across every write path.

begin;

-- -----------------------------------------------------------------------------
-- 1. Repair stale owners left behind when an organization membership was disabled.
--    Historical activities retain attribution; only the current operational owner is cleared.
-- -----------------------------------------------------------------------------
update public.leads l
set owner_user_id = null
where l.owner_user_id is not null
  and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = l.organization_id
      and om.user_id = l.owner_user_id
      and om.active = true
  );

-- -----------------------------------------------------------------------------
-- 2. Enforce current-owner tenant membership on every lead write path.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_lead_owner_membership_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.owner_user_id is null then
    return new;
  end if;

  if new.organization_id is null then
    raise exception 'Lead organization is required before assigning an owner';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    join public.profiles p on p.id = om.user_id
    where om.organization_id = new.organization_id
      and om.user_id = new.owner_user_id
      and om.active = true
      and p.active = true
  ) then
    raise exception 'Lead owner must be an active member of the lead organization';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_lead_owner_membership_v1() from public, anon, authenticated;
grant execute on function public.enforce_lead_owner_membership_v1() to service_role;

drop trigger if exists trg_leads_owner_membership_guard_v1 on public.leads;
create trigger trg_leads_owner_membership_guard_v1
before insert or update of organization_id, owner_user_id
on public.leads
for each row
execute function public.enforce_lead_owner_membership_v1();

-- -----------------------------------------------------------------------------
-- 3. Centralize next_followup_at as a cache derived from open/snoozed tasks.
--    This closes drift from automation/import paths that do not call CRM RPCs.
-- -----------------------------------------------------------------------------
create or replace function public.refresh_lead_next_followup_cache_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old_lead_id uuid;
  v_new_lead_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_lead_id := old.lead_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_lead_id := new.lead_id;
  end if;

  if v_old_lead_id is not null then
    update public.leads l
    set next_followup_at = (
      select min(t.due_at)
      from public.tasks t
      where t.lead_id = v_old_lead_id
        and t.status in ('open', 'snoozed')
        and t.due_at is not null
    )
    where l.id = v_old_lead_id;
  end if;

  if v_new_lead_id is not null
     and v_new_lead_id is distinct from v_old_lead_id then
    update public.leads l
    set next_followup_at = (
      select min(t.due_at)
      from public.tasks t
      where t.lead_id = v_new_lead_id
        and t.status in ('open', 'snoozed')
        and t.due_at is not null
    )
    where l.id = v_new_lead_id;
  elsif v_new_lead_id is not null and tg_op = 'INSERT' then
    update public.leads l
    set next_followup_at = (
      select min(t.due_at)
      from public.tasks t
      where t.lead_id = v_new_lead_id
        and t.status in ('open', 'snoozed')
        and t.due_at is not null
    )
    where l.id = v_new_lead_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_lead_next_followup_cache_v1() from public, anon, authenticated;
grant execute on function public.refresh_lead_next_followup_cache_v1() to service_role;

drop trigger if exists trg_tasks_refresh_lead_followup_cache_v1 on public.tasks;
create trigger trg_tasks_refresh_lead_followup_cache_v1
after insert or delete or update of lead_id, status, due_at
on public.tasks
for each row
execute function public.refresh_lead_next_followup_cache_v1();

-- Repair existing cache values once after installing the trigger.
update public.leads l
set next_followup_at = (
  select min(t.due_at)
  from public.tasks t
  where t.lead_id = l.id
    and t.status in ('open', 'snoozed')
    and t.due_at is not null
)
where l.next_followup_at is distinct from (
  select min(t.due_at)
  from public.tasks t
  where t.lead_id = l.id
    and t.status in ('open', 'snoozed')
    and t.due_at is not null
);

comment on function public.enforce_lead_owner_membership_v1() is
  'R3 invariant: a current lead owner must be an active profile and active member of the same organization.';

comment on function public.refresh_lead_next_followup_cache_v1() is
  'R3 invariant: leads.next_followup_at mirrors the earliest open or snoozed follow-up task.';

commit;
