-- R4 Customer Journey / Customer 360 operational completeness v1
-- Adds follow-up workload to Person 360 and selected CRM workflow events to the journey
-- without changing the existing canonical base views.

begin;

create or replace view public.v_person_360_operational
with (security_invoker = true)
as
with task_rollup as (
  select
    pl.organization_id,
    pl.person_id,
    count(distinct t.id) as task_count,
    count(distinct t.id) filter (
      where t.status::text in ('open', 'snoozed')
    ) as open_task_count,
    count(distinct t.id) filter (
      where t.status::text in ('open', 'snoozed')
        and t.due_at is not null
        and t.due_at < now()
    ) as overdue_task_count,
    min(t.due_at) filter (
      where t.status::text in ('open', 'snoozed')
        and t.due_at is not null
    ) as next_task_due_at,
    max(t.completed_at) filter (
      where t.status::text = 'completed'
    ) as last_task_completed_at
  from public.person_leads pl
  join public.tasks t
    on t.organization_id = pl.organization_id
   and t.lead_id = pl.lead_id
  group by
    pl.organization_id,
    pl.person_id
)
select
  p360.*,
  coalesce(tr.task_count, 0::bigint) as task_count,
  coalesce(tr.open_task_count, 0::bigint) as open_task_count,
  coalesce(tr.overdue_task_count, 0::bigint) as overdue_task_count,
  tr.next_task_due_at,
  tr.last_task_completed_at
from public.v_person_360 p360
left join task_rollup tr
  on tr.organization_id = p360.organization_id
 and tr.person_id = p360.person_id;

comment on view public.v_person_360_operational is
  'R4 tenant-aware Person 360 extension adding follow-up/task workload to the canonical identity, CRM, behavior, communications and commercial summary.';

revoke all on public.v_person_360_operational from public, anon;
grant select on public.v_person_360_operational to authenticated, service_role;

create or replace view public.v_person_journey_complete
with (security_invoker = true)
as
select
  j.organization_id,
  j.person_id,
  j.event_at,
  j.event_category,
  j.event_type,
  j.journey_event_key,
  j.source_table,
  j.source_record_id,
  j.lead_id,
  j.web_session_id,
  j.channel,
  j.source,
  j.title,
  j.summary,
  j.metadata
from public.v_person_journey j

union all

select
  pl.organization_id,
  pl.person_id,
  a.occurred_at as event_at,
  'workflow'::text as event_category,
  a.activity_type::text as event_type,
  ('activities:' || a.id::text) as journey_event_key,
  'activities'::text as source_table,
  a.id::text as source_record_id,
  a.lead_id,
  null::uuid as web_session_id,
  a.channel::text as channel,
  a.actor_type::text as source,
  coalesce(nullif(a.title, ''), initcap(replace(a.activity_type, '_', ' '))) as title,
  nullif(a.details, '') as summary,
  coalesce(a.metadata, '{}'::jsonb)
    || jsonb_strip_nulls(
      jsonb_build_object(
        'actor_type', a.actor_type::text,
        'actor_id', a.actor_id
      )
    ) as metadata
from public.activities a
join public.person_leads pl
  on pl.lead_id = a.lead_id
where a.activity_type = 'owner_assignment'
   or a.activity_type like 'followup_%';

comment on view public.v_person_journey_complete is
  'R4 complete tenant-aware customer journey: canonical Person journey plus selected operational workflow events such as ownership and follow-up lifecycle actions.';

revoke all on public.v_person_journey_complete from public, anon;
grant select on public.v_person_journey_complete to authenticated, service_role;

commit;

-- -----------------------------------------------------------------------------
-- CI-only historical recovery immediately after R4.
-- Production migration 20261018171201_r6_lead_objection_signals_v1 is absent
-- from source control, but the later Oct-27 security-hardening migration revokes
-- direct execution from its trigger function. Reconstruct the exact R6 contract
-- here so clean replay reaches the same pre-hardening state as production.
-- -----------------------------------------------------------------------------

begin;

create table if not exists public.lead_objection_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  category text not null,
  status text not null default 'active',
  evidence_kind text not null default 'human',
  source_message_id uuid null references public.messages(id) on delete set null,
  note text null,
  confidence numeric(5,4) null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null default auth.uid() references public.profiles(id) on delete set null,
  resolved_by uuid null references public.profiles(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_objection_signals_category_check check (
    category in (
      'price','timing','trust','schedule','location','accommodation','certification','health','travel','payment','family','work','other'
    )
  ),
  constraint lead_objection_signals_status_check check (status in ('active','resolved')),
  constraint lead_objection_signals_evidence_kind_check check (evidence_kind in ('human','model')),
  constraint lead_objection_signals_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint lead_objection_signals_resolution_check check (
    (status = 'active' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null)
  )
);

create index if not exists lead_objection_signals_org_lead_status_idx
  on public.lead_objection_signals (organization_id, lead_id, status, created_at desc);
create index if not exists lead_objection_signals_source_message_idx
  on public.lead_objection_signals (source_message_id)
  where source_message_id is not null;

create or replace function public.enforce_lead_objection_signal_tenant_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_lead_organization_id uuid;
  v_message_organization_id uuid;
  v_message_lead_id uuid;
begin
  select l.organization_id into v_lead_organization_id
  from public.leads l
  where l.id = new.lead_id;

  if v_lead_organization_id is null then
    raise exception 'Lead does not exist';
  end if;

  if new.organization_id <> v_lead_organization_id then
    raise exception 'Objection organization must match Lead organization';
  end if;

  if new.source_message_id is not null then
    select m.organization_id, m.lead_id
      into v_message_organization_id, v_message_lead_id
    from public.messages m
    where m.id = new.source_message_id;

    if v_message_organization_id is null then
      raise exception 'Source message does not exist';
    end if;

    if v_message_organization_id <> new.organization_id
       or v_message_lead_id is distinct from new.lead_id then
      raise exception 'Source message must belong to the same organization and Lead';
    end if;
  end if;

  if new.status = 'resolved' and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status = 'active' then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.enforce_lead_objection_signal_tenant_v1() from public, anon;

create trigger lead_objection_signals_tenant_guard_v1
before insert or update on public.lead_objection_signals
for each row execute function public.enforce_lead_objection_signal_tenant_v1();

alter table public.lead_objection_signals enable row level security;

create policy lead_objection_signals_read_v1
on public.lead_objection_signals
for select
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
);

create policy lead_objection_signals_insert_v1
on public.lead_objection_signals
for insert
to authenticated
with check (
  public.session_is_bound_to_organization(organization_id)
  and public.can_write_organization_crm(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1 from public.leads l
    where l.id = lead_id and l.organization_id = organization_id
  )
  and (created_by is null or created_by = auth.uid())
);

create policy lead_objection_signals_update_v1
on public.lead_objection_signals
for update
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.can_write_organization_crm(organization_id)
  and public.can_access_lead(lead_id)
)
with check (
  public.session_is_bound_to_organization(organization_id)
  and public.can_write_organization_crm(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1 from public.leads l
    where l.id = lead_id and l.organization_id = organization_id
  )
);

revoke all on public.lead_objection_signals from public, anon;
grant select, insert, update on public.lead_objection_signals to authenticated;
grant all on public.lead_objection_signals to service_role;

create or replace view public.v_lead_objection_summary_v1
with (security_invoker = true)
as
select
  l.organization_id,
  l.id as lead_id,
  count(o.id) as objection_count,
  count(o.id) filter (where o.status = 'active') as active_objection_count,
  count(o.id) filter (where o.status = 'resolved') as resolved_objection_count,
  array_agg(distinct o.category order by o.category)
    filter (where o.status = 'active') as active_objection_categories,
  max(o.created_at) filter (where o.status = 'active') as latest_active_objection_at,
  (array_agg(o.category order by o.created_at desc, o.id desc)
    filter (where o.status = 'active'))[1] as latest_active_objection_category,
  (array_agg(o.note order by o.created_at desc, o.id desc)
    filter (where o.status = 'active' and o.note is not null))[1] as latest_active_objection_note
from public.leads l
left join public.lead_objection_signals o
  on o.organization_id = l.organization_id
 and o.lead_id = l.id
group by l.organization_id, l.id;

comment on table public.lead_objection_signals is
  'R6 structured objection evidence. Human evidence is stored explicitly; model evidence may be added later only with provenance and confidence.';
comment on view public.v_lead_objection_summary_v1 is
  'Tenant-safe objection summary by Lead. Objection evidence remains separate from derived intent and affinity.';

revoke all on public.v_lead_objection_summary_v1 from public, anon;
grant select on public.v_lead_objection_summary_v1 to authenticated, service_role;

-- Production also contains this trigger function, but its creator is absent
-- from both the migration ledger and source history. The Oct-27 security revoke
-- expects the function to exist. Recover only the function object here; do not
-- attach a trigger or mutate course_batches in replay.
create or replace function public.sync_course_batch_effective_active()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.active :=
    coalesce(new.source_active, true)
    and
    coalesce(new.local_enabled, true);

  return new;
end;
$function$;

commit;
