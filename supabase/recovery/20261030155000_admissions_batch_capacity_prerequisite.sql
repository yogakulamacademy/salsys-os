-- Cold-recovery compatibility only.
--
-- Production had the Admissions batch-capacity read-model chain before
-- 20261030155113_harden_course_management_permissions and before the Nov 1
-- Admissions closeout, but that foundation was installed manually and never
-- entered the production migration ledger or source-controlled migrations.
--
-- This recovery prerequisite reconstructs only the four base views required by
-- those later real migrations. It intentionally does NOT create
-- v_admissions_upcoming_batch_capacity; the real Admissions closeout migration
-- must still create and validate that downstream view during clean replay.
--
-- Never run this recovery file against current production.

begin;

create or replace view public.v_batch_latest_enrollment
with (security_invoker = true)
as
select distinct on (organization_id, lead_id, batch_id)
  lead_id,
  batch_id,
  status::text as enrollment_status,
  total_value,
  currency,
  enrolled_at,
  created_at,
  updated_at,
  organization_id
from public.enrollments e
where batch_id is not null
order by organization_id, lead_id, batch_id, created_at desc, updated_at desc;

create or replace view public.v_batch_enrolled_leads
with (security_invoker = true)
as
with enrollment_seats as (
  select
    le.batch_id,
    le.lead_id,
    'enrollment'::text as seat_source,
    le.organization_id
  from public.v_batch_latest_enrollment le
  where le.enrollment_status = any (array['confirmed'::text, 'completed'::text])
),
stage_fallback as (
  select
    l.preferred_batch_id as batch_id,
    l.id as lead_id,
    'lead_stage_fallback'::text as seat_source,
    l.organization_id
  from public.leads l
  where l.preferred_batch_id is not null
    and l.current_stage = 'enrolled'::public.lead_stage
    and l.status <> 'archived'::public.lead_status
    and not exists (
      select 1
      from public.v_batch_latest_enrollment le
      where le.lead_id = l.id
        and le.batch_id = l.preferred_batch_id
        and le.organization_id = l.organization_id
    )
)
select
  enrollment_seats.batch_id,
  enrollment_seats.lead_id,
  enrollment_seats.seat_source,
  enrollment_seats.organization_id
from enrollment_seats
union
select
  stage_fallback.batch_id,
  stage_fallback.lead_id,
  stage_fallback.seat_source,
  stage_fallback.organization_id
from stage_fallback;

create or replace view public.v_batch_demand_leads
with (security_invoker = true)
as
select
  id as lead_id,
  lead_code,
  coalesce(
    display_name,
    nullif(btrim(concat_ws(' ', first_name, last_name)), ''),
    lead_code
  ) as lead_name,
  preferred_batch_id as batch_id,
  owner_user_id,
  current_stage::text as current_stage,
  intent::text as intent,
  created_at,
  last_contacted_at,
  next_followup_at,
  last_inbound_at is not null
    and (last_outbound_at is null or last_inbound_at > last_outbound_at) as needs_reply,
  case
    when current_stage = 'payment_pending'::public.lead_stage then 'critical'::text
    when current_stage = 'high_intent'::public.lead_stage
      or intent = 'very_high'::public.intent_level then 'high'::text
    when current_stage = 'qualified'::public.lead_stage
      or intent = 'high'::public.intent_level then 'medium'::text
    else 'low'::text
  end as priority_band,
  case
    when current_stage = 'payment_pending'::public.lead_stage then 90
    when current_stage = 'high_intent'::public.lead_stage
      or intent = 'very_high'::public.intent_level then 75
    when current_stage = 'qualified'::public.lead_stage
      or intent = 'high'::public.intent_level then 55
    when current_stage = 'engaged'::public.lead_stage then 35
    when current_stage = 'contacted'::public.lead_stage then 20
    else 10
  end as priority_score,
  case
    when current_stage = 'payment_pending'::public.lead_stage then 'Follow up on payment'::text
    when current_stage = 'high_intent'::public.lead_stage then 'Contact high-intent prospect'::text
    when current_stage = 'qualified'::public.lead_stage then 'Advance qualified prospect'::text
    when current_stage = 'new'::public.lead_stage then 'Make first contact'::text
    else 'Review lead'::text
  end as next_best_action,
  case
    when current_stage = 'payment_pending'::public.lead_stage then 'payment_pending'::text
    else 'unvalued'::text
  end as payment_status,
  null::numeric as net_paid,
  null::numeric as outstanding_balance,
  null::text as currency,
  current_stage = any (array[
    'new'::public.lead_stage,
    'contacted'::public.lead_stage,
    'engaged'::public.lead_stage,
    'qualified'::public.lead_stage,
    'high_intent'::public.lead_stage,
    'payment_pending'::public.lead_stage
  ]) as is_active_prospect,
  current_stage = any (array[
    'qualified'::public.lead_stage,
    'high_intent'::public.lead_stage,
    'payment_pending'::public.lead_stage
  ]) as is_qualified_prospect,
  (
    current_stage = any (array[
      'high_intent'::public.lead_stage,
      'payment_pending'::public.lead_stage
    ])
    or intent = 'very_high'::public.intent_level
  ) as is_hot_prospect,
  current_stage = 'payment_pending'::public.lead_stage as is_payment_pending,
  false as has_payment,
  owner_user_id is null as is_unassigned,
  organization_id
from public.leads l
where preferred_batch_id is not null
  and status <> 'archived'::public.lead_status;

create or replace view public.v_admissions_batch_capacity
with (security_invoker = true)
as
with enrolled as (
  select
    e.organization_id,
    e.batch_id,
    count(distinct e.lead_id) as enrolled_count
  from public.v_batch_enrolled_leads e
  group by e.organization_id, e.batch_id
),
demand as (
  select
    d.organization_id,
    d.batch_id,
    count(*) filter (where d.is_active_prospect) as active_prospects,
    count(*) filter (
      where d.is_active_prospect and d.current_stage = 'new'::text
    ) as new_prospects,
    count(*) filter (
      where d.is_active_prospect and d.is_qualified_prospect
    ) as qualified_prospects,
    count(*) filter (
      where d.is_active_prospect and d.is_hot_prospect
    ) as hot_prospects,
    count(*) filter (
      where d.is_active_prospect and d.is_payment_pending
    ) as payment_pending,
    0::bigint as paid_or_partial_prospects,
    count(*) filter (
      where d.is_active_prospect and d.needs_reply
    ) as needs_reply,
    count(*) filter (
      where d.is_active_prospect and d.priority_band = 'critical'::text
    ) as critical_prospects,
    count(*) filter (
      where d.is_active_prospect and d.priority_band = 'high'::text
    ) as high_priority_prospects,
    count(*) filter (
      where d.is_active_prospect and d.is_unassigned
    ) as unassigned_prospects
  from public.v_batch_demand_leads d
  group by d.organization_id, d.batch_id
),
base as (
  select
    cb.id as batch_id,
    cb.course_id,
    c.code as course_code,
    c.name as course_name,
    cb.batch_code,
    cb.location,
    cb.mode,
    cb.start_date,
    cb.end_date,
    cb.start_time,
    cb.end_time,
    cb.timezone,
    cb.capacity,
    cb.seats_remaining as stored_seats_remaining,
    cb.active,
    coalesce(e.enrolled_count, 0::bigint) as enrolled_count,
    coalesce(d.active_prospects, 0::bigint) as active_prospects,
    coalesce(d.new_prospects, 0::bigint) as new_prospects,
    coalesce(d.qualified_prospects, 0::bigint) as qualified_prospects,
    coalesce(d.hot_prospects, 0::bigint) as hot_prospects,
    coalesce(d.payment_pending, 0::bigint) as payment_pending,
    coalesce(d.paid_or_partial_prospects, 0::bigint) as paid_or_partial_prospects,
    coalesce(d.needs_reply, 0::bigint) as needs_reply,
    coalesce(d.critical_prospects, 0::bigint) as critical_prospects,
    coalesce(d.high_priority_prospects, 0::bigint) as high_priority_prospects,
    coalesce(d.unassigned_prospects, 0::bigint) as unassigned_prospects,
    cb.organization_id
  from public.course_batches cb
  left join public.courses c
    on c.id = cb.course_id
   and c.organization_id = cb.organization_id
  left join enrolled e
    on e.batch_id = cb.id
   and e.organization_id = cb.organization_id
  left join demand d
    on d.batch_id = cb.id
   and d.organization_id = cb.organization_id
)
select
  batch_id,
  course_id,
  course_code,
  course_name,
  batch_code,
  location,
  mode,
  start_date,
  end_date,
  start_time,
  end_time,
  timezone,
  capacity,
  stored_seats_remaining,
  active,
  enrolled_count,
  active_prospects,
  new_prospects,
  qualified_prospects,
  hot_prospects,
  payment_pending,
  paid_or_partial_prospects,
  needs_reply,
  critical_prospects,
  high_priority_prospects,
  unassigned_prospects,
  case
    when capacity is null then null::bigint
    else greatest(capacity - enrolled_count, 0::bigint)
  end as calculated_seats_remaining,
  case
    when capacity is null then null::bigint
    else greatest(enrolled_count - capacity, 0::bigint)
  end as overbooked_by,
  enrolled_count + payment_pending as enrolled_plus_payment_pending,
  enrolled_count + active_prospects as total_live_demand,
  case
    when capacity is null then null::bigint
    else capacity - enrolled_count - payment_pending
  end as projected_seats_after_payment_pending,
  case
    when capacity is null or capacity <= 0 then null::numeric
    else round(enrolled_count::numeric / capacity::numeric * 100::numeric, 1)
  end as enrolled_capacity_percent,
  case
    when capacity is null or capacity <= 0 then null::numeric
    else round(
      (enrolled_count + active_prospects)::numeric / capacity::numeric * 100::numeric,
      1
    )
  end as live_demand_capacity_percent,
  case
    when start_date is null then null::integer
    else start_date - current_date
  end as days_to_start,
  case
    when capacity is null or capacity <= 0 then 'capacity_not_set'::text
    when enrolled_count > capacity then 'overbooked'::text
    when enrolled_count >= capacity then 'full'::text
    when (capacity - enrolled_count) <= greatest(
      2,
      ceil(capacity::numeric * 0.15)::integer
    ) then 'near_full'::text
    when (enrolled_count + payment_pending) >= capacity then 'payment_pressure'::text
    when active_prospects >= (capacity - enrolled_count) then 'demand_exceeds_open_seats'::text
    else 'healthy'::text
  end as capacity_status,
  organization_id
from base;

commit;
