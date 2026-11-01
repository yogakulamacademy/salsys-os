begin;

-- =============================================================================
-- Admissions final closeout V1
--
-- A batch is operationally "upcoming" when its effective schedule has not
-- ended. If end_date is missing, start_date becomes the conservative boundary.
-- Past active records with neither a future start nor a future end must never
-- pollute Admissions capacity planning.
-- =============================================================================

create or replace view public.v_admissions_upcoming_batch_capacity
with (security_invoker = true)
as
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
  calculated_seats_remaining,
  overbooked_by,
  enrolled_plus_payment_pending,
  total_live_demand,
  projected_seats_after_payment_pending,
  enrolled_capacity_percent,
  live_demand_capacity_percent,
  days_to_start,
  capacity_status,
  organization_id
from public.v_admissions_batch_capacity b
where
  active = true
  and coalesce(end_date, start_date) >= current_date
order by
  organization_id,
  case when start_date is null then 1 else 0 end,
  start_date,
  course_name,
  batch_code;

comment on view public.v_admissions_upcoming_batch_capacity is
  'Admissions planning view. Active batches remain visible while their end date is current/future; when end_date is absent, start_date is the fallback boundary. Past undated-ended batches are excluded.';

commit;
