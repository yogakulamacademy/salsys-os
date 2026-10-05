-- Phase 4 — Customer Journey / Customer 360
-- Migration 016: harden legacy journey views for active-workspace scoping.
--
-- Goals:
-- 1) Preserve every existing column and its order.
-- 2) Append organization_id as the final column.
-- 3) Keep security_invoker=true so underlying RLS continues to apply.
-- 4) Make source-level journey aggregation tenant-aware.
--
-- No base-table data is mutated.

begin;

create or replace view public.v_contact_intelligence_touch_journey
with (security_invoker = true)
as
with conversion_time as (
  select
    l_1.organization_id,
    l_1.id as lead_id,
    coalesce(
      (
        select min(h.changed_at)
        from public.lead_stage_history h
        where h.lead_id = l_1.id
          and h.to_stage = 'enrolled'::public.lead_stage
      ),
      (
        select min(coalesce(e.enrolled_at, e.created_at))
        from public.enrollments e
        where e.lead_id = l_1.id
          and e.organization_id = l_1.organization_id
          and e.status = any (
            array[
              'confirmed'::public.enrollment_status,
              'completed'::public.enrollment_status
            ]
          )
      )
    ) as enrolled_at
  from public.leads l_1
)
select
  lcl.id as contact_log_id,
  lcl.lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(
      btrim(concat_ws(' ', l.first_name, l.last_name)),
      ''
    ),
    l.lead_code
  ) as lead_name,
  lcl.employee_user_id,
  coalesce(
    p.full_name,
    lcl.employee_name_snapshot,
    'System'
  ) as employee_name,
  lcl.method,
  lcl.direction,
  lcl.outcome,
  lcl.source,
  lcl.contacted_at,
  lcl.comment,
  lcl.call_duration_seconds,
  row_number() over (
    partition by l.organization_id, lcl.lead_id
    order by lcl.contacted_at, lcl.created_at, lcl.id
  ) as touch_number,
  row_number() over (
    partition by l.organization_id, lcl.lead_id, lcl.direction
    order by lcl.contacted_at, lcl.created_at, lcl.id
  ) as direction_touch_number,
  coalesce(
    stage_at_contact.to_stage::text,
    'new'
  ) as stage_at_contact,
  next_stage.to_stage::text as next_stage,
  next_stage.changed_at as next_stage_at,
  case
    when next_stage.changed_at is not null
      then round(
        extract(epoch from next_stage.changed_at - lcl.contacted_at) / 60::numeric,
        2
      )
    else null::numeric
  end as minutes_to_next_stage,
  ct.enrolled_at,
  (
    ct.enrolled_at is not null
    and ct.enrolled_at >= lcl.contacted_at
  ) as enrolled_after_this_touch,
  l.organization_id
from public.lead_contact_logs lcl
join public.leads l
  on l.id = lcl.lead_id
left join public.profiles p
  on p.id = lcl.employee_user_id
left join conversion_time ct
  on ct.lead_id = lcl.lead_id
 and ct.organization_id = l.organization_id
left join lateral (
  select
    h.to_stage,
    h.changed_at
  from public.lead_stage_history h
  where h.lead_id = lcl.lead_id
    and h.changed_at <= lcl.contacted_at
  order by h.changed_at desc
  limit 1
) stage_at_contact
  on true
left join lateral (
  select
    h.to_stage,
    h.changed_at
  from public.lead_stage_history h
  where h.lead_id = lcl.lead_id
    and h.changed_at > lcl.contacted_at
  order by h.changed_at
  limit 1
) next_stage
  on true;


create or replace view public.v_source_journey_summary
with (security_invoker = true)
as
select
  coalesce(
    nullif(j.first_session_source, ''),
    'Unknown'
  ) as first_source,
  coalesce(
    nullif(j.first_session_medium, ''),
    'Unknown'
  ) as first_medium,
  count(*) as leads,
  count(*) filter (
    where j.sessions_before_lead >= 2
  ) as repeat_visit_leads,
  count(*) filter (
    where j.sessions_after_lead > 0
  ) as post_lead_returners,
  count(*) filter (
    where j.is_reengaged
  ) as reengaged_leads,
  count(*) filter (
    where j.behaviour_temperature = 'hot'
  ) as hot_leads,
  round(
    avg(j.conversion_visit_number)
      filter (
        where j.conversion_visit_number is not null
      ),
    2
  ) as avg_visits_to_lead,
  round(
    avg(j.days_first_visit_to_lead)
      filter (
        where j.days_first_visit_to_lead is not null
      ),
    2
  ) as avg_days_to_lead,
  j.organization_id
from public.v_lead_journey_intelligence j
group by
  j.organization_id,
  coalesce(
    nullif(j.first_session_source, ''),
    'Unknown'
  ),
  coalesce(
    nullif(j.first_session_medium, ''),
    'Unknown'
  );

comment on view public.v_contact_intelligence_touch_journey is
  'Tenant-aware contact journey intelligence. Existing columns preserved; organization_id appended for active-workspace scoping.';

comment on view public.v_source_journey_summary is
  'Tenant-aware source journey summary grouped by organization_id, first source, and first medium. Existing columns preserved; organization_id appended for active-workspace scoping.';

commit;
