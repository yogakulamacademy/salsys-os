begin;

-- =============================================================================
-- CRM Core Closeout V1
--
-- Closes the remaining integrity gaps observed during the production CRM audit:
--   * lead.current_stage must reconcile with immutable lead_stage_history;
--   * active CRM work cannot remain assigned to inactive organization members;
--   * assignment drift is cleaned automatically when a member is deactivated;
--   * a tenant-safe health view exposes the core CRM invariants in one place.
--
-- Historical records remain intact. Only active/open assignment pointers are
-- cleared when the assignee is no longer active.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reconcile any historical stage drift from the authoritative lead state.
-- -----------------------------------------------------------------------------

with latest_stage as (
  select distinct on (h.lead_id)
    h.lead_id,
    h.to_stage
  from public.lead_stage_history h
  order by h.lead_id, h.changed_at desc, h.id desc
)
insert into public.lead_stage_history (
  lead_id,
  from_stage,
  to_stage,
  changed_by_type,
  changed_by_id,
  reason,
  changed_at
)
select
  l.id,
  ls.to_stage,
  l.current_stage,
  'system'::public.actor_type,
  'crm_core_closeout_v1',
  'Reconciled stage history to the authoritative CRM lead state during CRM Core Closeout V1.',
  now()
from public.leads l
left join latest_stage ls
  on ls.lead_id = l.id
where ls.to_stage is distinct from l.current_stage;

-- -----------------------------------------------------------------------------
-- 2. Clean active work that still points to inactive/non-member assignees.
--    Completed/historical work is deliberately left unchanged.
-- -----------------------------------------------------------------------------

update public.conversations c
set assigned_to = null
where c.status = 'open'
  and c.assigned_to is not null
  and not exists (
    select 1
    from public.organization_members om
    join public.profiles p
      on p.id = om.user_id
    where om.organization_id = c.organization_id
      and om.user_id = c.assigned_to
      and om.active = true
      and p.active = true
  );

update public.tasks t
set assigned_to = null
where t.status in ('open', 'snoozed')
  and t.assigned_to is not null
  and not exists (
    select 1
    from public.organization_members om
    join public.profiles p
      on p.id = om.user_id
    where om.organization_id = t.organization_id
      and om.user_id = t.assigned_to
      and om.active = true
      and p.active = true
  );

update public.leads l
set owner_user_id = null
where l.owner_user_id is not null
  and not exists (
    select 1
    from public.organization_members om
    join public.profiles p
      on p.id = om.user_id
    where om.organization_id = l.organization_id
      and om.user_id = l.owner_user_id
      and om.active = true
      and p.active = true
  );

-- -----------------------------------------------------------------------------
-- 3. Active-work assignment guard.
-- -----------------------------------------------------------------------------

create or replace function public.enforce_active_crm_assignee_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if new.assigned_to is null then
    return new;
  end if;

  if new.organization_id is null then
    raise exception 'CRM work organization is required before assignment';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    join public.profiles p
      on p.id = om.user_id
    where om.organization_id = new.organization_id
      and om.user_id = new.assigned_to
      and om.active = true
      and p.active = true
  ) then
    raise exception 'CRM assignee must be an active member of the same organization';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_active_crm_assignee_v1()
  from public, anon, authenticated;

-- Trigger functions do not require direct client execution privileges.

drop trigger if exists conversations_active_assignee_guard_v1
  on public.conversations;
create trigger conversations_active_assignee_guard_v1
before insert or update of organization_id, assigned_to
on public.conversations
for each row
execute function public.enforce_active_crm_assignee_v1();

drop trigger if exists tasks_active_assignee_guard_v1
  on public.tasks;
create trigger tasks_active_assignee_guard_v1
before insert or update of organization_id, assigned_to
on public.tasks
for each row
execute function public.enforce_active_crm_assignee_v1();

-- -----------------------------------------------------------------------------
-- 4. Membership deactivation lifecycle cleanup.
--
-- An assignee can become invalid after a perfectly valid assignment if their
-- organization membership is later disabled. Clear only active/open work so
-- historical completed-work attribution remains available.
-- -----------------------------------------------------------------------------

create or replace function public.reconcile_crm_assignments_on_member_status_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid;
  v_user_id uuid;
  v_should_clear boolean := false;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_user_id := old.user_id;
    v_should_clear := old.active = true;
  else
    v_organization_id := new.organization_id;
    v_user_id := new.user_id;
    v_should_clear := old.active = true and new.active = false;
  end if;

  if not v_should_clear then
    return coalesce(new, old);
  end if;

  update public.leads
  set owner_user_id = null
  where organization_id = v_organization_id
    and owner_user_id = v_user_id;

  update public.tasks
  set assigned_to = null
  where organization_id = v_organization_id
    and assigned_to = v_user_id
    and status in ('open', 'snoozed');

  update public.conversations
  set assigned_to = null
  where organization_id = v_organization_id
    and assigned_to = v_user_id
    and status = 'open';

  return coalesce(new, old);
end;
$function$;

revoke all on function public.reconcile_crm_assignments_on_member_status_v1()
  from public, anon, authenticated;

drop trigger if exists organization_members_clear_crm_assignments_v1
  on public.organization_members;
create trigger organization_members_clear_crm_assignments_v1
after update of active or delete
on public.organization_members
for each row
execute function public.reconcile_crm_assignments_on_member_status_v1();

-- -----------------------------------------------------------------------------
-- 5. Deferred lead-stage/history consistency invariant.
--
-- set_lead_stage() updates the lead first and then appends lead_stage_history in
-- the same transaction. A deferred constraint trigger therefore allows the
-- canonical RPC while rejecting any transaction that leaves stage/history drift.
-- -----------------------------------------------------------------------------

create or replace function public.enforce_lead_stage_history_consistency_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_latest_stage public.lead_stage;
begin
  select h.to_stage
  into v_latest_stage
  from public.lead_stage_history h
  where h.lead_id = new.id
  order by h.changed_at desc, h.id desc
  limit 1;

  if v_latest_stage is distinct from new.current_stage then
    raise exception
      'Lead stage/history integrity violation for lead %: current stage %, latest history %',
      new.id,
      new.current_stage,
      v_latest_stage;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_lead_stage_history_consistency_v1()
  from public, anon, authenticated;

drop trigger if exists leads_stage_history_consistency_v1
  on public.leads;
create constraint trigger leads_stage_history_consistency_v1
after insert or update
on public.leads
deferrable initially deferred
for each row
execute function public.enforce_lead_stage_history_consistency_v1();

-- -----------------------------------------------------------------------------
-- 6. Core CRM integrity health view.
-- -----------------------------------------------------------------------------

create or replace view public.v_crm_core_integrity_health_v1
with (security_invoker = true)
as
select
  metrics.*,
  (
    metrics.leads_without_contacts
    + metrics.leads_without_stage_history
    + metrics.stage_history_mismatch
    + metrics.stage_status_mismatch
    + metrics.leads_without_person
    + metrics.leads_without_attribution
    + metrics.next_followup_mismatch
    + metrics.invalid_lead_owner
    + metrics.invalid_open_task_assignee
    + metrics.invalid_open_conversation_assignee
    + metrics.contact_tenant_mismatch
    + metrics.task_tenant_mismatch
    + metrics.attribution_tenant_mismatch
    + metrics.person_link_tenant_mismatch
    + metrics.conversation_tenant_mismatch
    + metrics.message_lineage_mismatch
    + metrics.duplicate_primary_contact_type
  )::bigint as integrity_issue_count,
  case
    when (
      metrics.leads_without_contacts
      + metrics.leads_without_stage_history
      + metrics.stage_history_mismatch
      + metrics.stage_status_mismatch
      + metrics.leads_without_person
      + metrics.leads_without_attribution
      + metrics.next_followup_mismatch
      + metrics.invalid_lead_owner
      + metrics.invalid_open_task_assignee
      + metrics.invalid_open_conversation_assignee
      + metrics.contact_tenant_mismatch
      + metrics.task_tenant_mismatch
      + metrics.attribution_tenant_mismatch
      + metrics.person_link_tenant_mismatch
      + metrics.conversation_tenant_mismatch
      + metrics.message_lineage_mismatch
      + metrics.duplicate_primary_contact_type
    ) = 0 then 'healthy'
    else 'degraded'
  end as health_status
from (
  select
    o.id as organization_id,
    o.name as organization_name,

    (select count(*) from public.leads l where l.organization_id = o.id)::bigint
      as lead_count,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and not exists (
         select 1 from public.lead_contacts c
         where c.organization_id = l.organization_id
           and c.lead_id = l.id
       ))::bigint
      as leads_without_contacts,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and not exists (
         select 1 from public.lead_stage_history h
         where h.lead_id = l.id
       ))::bigint
      as leads_without_stage_history,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and (
         select h.to_stage
         from public.lead_stage_history h
         where h.lead_id = l.id
         order by h.changed_at desc, h.id desc
         limit 1
       ) is distinct from l.current_stage)::bigint
      as stage_history_mismatch,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and (
         (l.current_stage = 'enrolled' and l.status::text <> 'won')
         or (l.current_stage in ('lost','unqualified','duplicate') and l.status::text <> 'lost')
         or (l.current_stage not in ('enrolled','lost','unqualified','duplicate') and l.status::text <> 'open')
       ))::bigint
      as stage_status_mismatch,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and not exists (
         select 1 from public.person_leads pl
         where pl.organization_id = l.organization_id
           and pl.lead_id = l.id
       ))::bigint
      as leads_without_person,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and not exists (
         select 1 from public.lead_attribution a
         where a.organization_id = l.organization_id
           and a.lead_id = l.id
       ))::bigint
      as leads_without_attribution,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and l.next_followup_at is distinct from (
         select min(t.due_at)
         from public.tasks t
         where t.organization_id = l.organization_id
           and t.lead_id = l.id
           and t.status in ('open','snoozed')
       ))::bigint
      as next_followup_mismatch,

    (select count(*)
     from public.leads l
     where l.organization_id = o.id
       and l.owner_user_id is not null
       and not exists (
         select 1
         from public.organization_members om
         join public.profiles p on p.id = om.user_id
         where om.organization_id = l.organization_id
           and om.user_id = l.owner_user_id
           and om.active = true
           and p.active = true
       ))::bigint
      as invalid_lead_owner,

    (select count(*)
     from public.tasks t
     where t.organization_id = o.id
       and t.status in ('open','snoozed')
       and t.assigned_to is not null
       and not exists (
         select 1
         from public.organization_members om
         join public.profiles p on p.id = om.user_id
         where om.organization_id = t.organization_id
           and om.user_id = t.assigned_to
           and om.active = true
           and p.active = true
       ))::bigint
      as invalid_open_task_assignee,

    (select count(*)
     from public.conversations c
     where c.organization_id = o.id
       and c.status = 'open'
       and c.assigned_to is not null
       and not exists (
         select 1
         from public.organization_members om
         join public.profiles p on p.id = om.user_id
         where om.organization_id = c.organization_id
           and om.user_id = c.assigned_to
           and om.active = true
           and p.active = true
       ))::bigint
      as invalid_open_conversation_assignee,

    (select count(*)
     from public.lead_contacts c
     join public.leads l on l.id = c.lead_id
     where c.organization_id = o.id
       and l.organization_id <> c.organization_id)::bigint
      as contact_tenant_mismatch,

    (select count(*)
     from public.tasks t
     join public.leads l on l.id = t.lead_id
     where t.organization_id = o.id
       and l.organization_id <> t.organization_id)::bigint
      as task_tenant_mismatch,

    (select count(*)
     from public.lead_attribution a
     join public.leads l on l.id = a.lead_id
     where a.organization_id = o.id
       and l.organization_id <> a.organization_id)::bigint
      as attribution_tenant_mismatch,

    (select count(*)
     from public.person_leads pl
     join public.leads l on l.id = pl.lead_id
     join public.persons p on p.id = pl.person_id
     where pl.organization_id = o.id
       and (
         l.organization_id <> pl.organization_id
         or p.organization_id <> pl.organization_id
       ))::bigint
      as person_link_tenant_mismatch,

    (select count(*)
     from public.conversations c
     join public.leads l on l.id = c.lead_id
     where c.organization_id = o.id
       and l.organization_id <> c.organization_id)::bigint
      as conversation_tenant_mismatch,

    (select count(*)
     from public.messages m
     join public.leads l on l.id = m.lead_id
     join public.conversations c on c.id = m.conversation_id
     where m.organization_id = o.id
       and (
         l.organization_id <> m.organization_id
         or c.organization_id <> m.organization_id
         or c.lead_id <> m.lead_id
       ))::bigint
      as message_lineage_mismatch,

    (select count(*)
     from (
       select c.lead_id, c.contact_type
       from public.lead_contacts c
       where c.organization_id = o.id
         and c.is_primary = true
       group by c.lead_id, c.contact_type
       having count(*) > 1
     ) duplicates)::bigint
      as duplicate_primary_contact_type

  from public.organizations o
) metrics;

comment on view public.v_crm_core_integrity_health_v1 is
  'Tenant-scoped CRM core integrity health. Healthy requires zero lead/contact/stage/person/attribution/follow-up/assignment/lineage violations.';

grant select on public.v_crm_core_integrity_health_v1
  to authenticated, service_role;

commit;
