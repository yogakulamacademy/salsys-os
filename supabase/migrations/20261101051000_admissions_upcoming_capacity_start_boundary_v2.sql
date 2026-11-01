begin;

-- The workspace and view are explicitly named "upcoming". Use the recorded
-- start date as the authoritative planning boundary so malformed or unusually
-- long end dates cannot keep historical cohorts in future capacity planning.
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
  and start_date >= current_date
order by
  organization_id,
  start_date,
  course_name,
  batch_code;

comment on view public.v_admissions_upcoming_batch_capacity is
  'Admissions planning view for active batches starting today or later. start_date is authoritative so malformed historical end dates cannot keep old cohorts in upcoming capacity.';

commit;
