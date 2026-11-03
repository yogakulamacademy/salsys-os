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
