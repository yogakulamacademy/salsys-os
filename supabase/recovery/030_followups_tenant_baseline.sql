-- PH-5.2B.1j — cold-recovery compatibility only.
--
-- Purpose:
--   Migration 030's admissions priority queue expects public.v_followups_due to
--   expose organization_id. The recorded chain through 029 still has the legacy
--   migration-002 view and public.tasks has no organization_id column.
--
-- Production shape verified 2026-10-30:
--   tasks.organization_id uuid NOT NULL, no default
--   FK -> public.organizations(id) ON DELETE RESTRICT
--   v_followups_due uses security_invoker=true and joins tasks/leads by tenant
--
-- This file is NOT part of the normal production migration ledger.
-- Never run it against current production.

alter table public.tasks
  add column if not exists organization_id uuid;

update public.tasks t
set organization_id = l.organization_id
from public.leads l
where l.id = t.lead_id
  and t.organization_id is null;

do $$
begin
  if exists (
    select 1
    from public.tasks t
    where t.organization_id is null
  ) then
    raise exception
      '030 recovery abort: tasks contains rows whose organization cannot be resolved from lead_id';
  end if;
end
$$;

alter table public.tasks
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_organization_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;

create or replace view public.v_followups_due
with (security_invoker = true)
as
select
  t.id as task_id,
  t.lead_id,
  l.lead_code,
  coalesce(
    l.display_name,
    trim(concat_ws(' ', l.first_name, l.last_name)),
    l.lead_code
  ) as lead_name,
  t.title,
  t.due_at,
  t.assigned_to,
  l.current_stage,
  l.intent,
  l.current_contact_channel,
  t.organization_id
from public.tasks t
join public.leads l
  on l.id = t.lead_id
 and l.organization_id = t.organization_id
where t.status = any(array[
  'open'::public.task_status,
  'snoozed'::public.task_status
])
  and t.due_at is not null
  and t.due_at <= now();
