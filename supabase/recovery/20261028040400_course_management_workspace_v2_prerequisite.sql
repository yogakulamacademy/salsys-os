-- Cold-recovery compatibility only.
--
-- get_course_management_workspace_v2(uuid,text,text,text) existed in production
-- before 20261028040448 promoted it to SECURITY DEFINER, but its creator is
-- absent from the production migration ledger and available Git history.
-- Reconstruct the pre-promotion/pre-closeout contract from the preserved live
-- implementation. Keep the legacy end-date and missing-capacity predicates so
-- 20261101053000_operations_final_closeout_v1 can evolve them normally.
--
-- CI only. Never apply this recovery file directly to current production.

begin;

create or replace function public.get_course_management_workspace_v2(
  p_organization_id uuid,
  p_query text default '',
  p_location text default 'all',
  p_state text default 'upcoming'
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not public.is_crm_user()
     or not public.is_organization_member(p_organization_id)
  then
    raise exception 'Not authorized for selected workspace';
  end if;

  with
  params as (
    select
      lower(trim(coalesce(p_query, ''))) as query_text,
      coalesce(nullif(p_location, ''), 'all') as location_filter,
      coalesce(nullif(p_state, ''), 'upcoming') as state_filter,
      current_date as today_date
  ),
  courses_base as materialized (
    select
      c.id as course_id,
      c.code,
      c.name,
      c.category,
      c.hours,
      c.active,
      c.source_system,
      c.external_course_id,
      c.created_at,
      c.updated_at
    from public.courses c
    where c.organization_id = p_organization_id
    order by c.active desc, c.name asc, c.code asc
  ),
  base_batches as materialized (
    select
      cb.id as batch_id,
      cb.organization_id,
      cb.course_id,
      c.code as course_code,
      c.name as course_name,
      c.active as course_active,
      cb.batch_code,
      cb.location,
      cb.mode,
      cb.start_date,
      cb.end_date,
      cb.start_time,
      cb.end_time,
      cb.timezone,
      cb.capacity,
      cb.seats_remaining as published_seats_remaining,
      coalesce(cap.enrolled_count, 0) as enrolled_count,
      cap.calculated_seats_remaining,
      coalesce(cap.active_prospects, 0) as active_prospects,
      coalesce(cap.hot_prospects, 0) as hot_prospects,
      coalesce(cap.payment_pending, 0) as payment_pending,
      coalesce(cap.needs_reply, 0) as needs_reply,
      coalesce(cap.critical_prospects, 0) as critical_prospects,
      coalesce(cap.unassigned_prospects, 0) as unassigned_prospects,
      cap.capacity_status,
      cb.expected_value,
      cb.currency,
      cb.price_private,
      cb.price_shared,
      cb.price_course_only,
      cb.enrollment_open,
      cb.enrollment_closed_at,
      cb.enrollment_note,
      cb.active,
      cb.local_enabled,
      cb.source_active,
      cb.source_system,
      cb.external_batch_id,
      (
        cb.active is not false
        and cb.local_enabled is not false
        and cb.source_active is not false
      ) as effective_active,
      cb.created_at,
      cb.updated_at
    from public.course_batches cb
    join public.courses c
      on c.id = cb.course_id
     and c.organization_id = cb.organization_id
    left join public.v_admissions_batch_capacity cap
      on cap.batch_id = cb.id
     and cap.organization_id = cb.organization_id
    where cb.organization_id = p_organization_id
    order by cb.start_date asc nulls last, cb.created_at asc
    limit 500
  ),
  filtered_batches as materialized (
    select b.*
    from base_batches b
    cross join params p
    where
      (
        p.query_text = ''
        or lower(concat_ws(
          ' ',
          b.course_name,
          b.course_code,
          b.batch_code,
          b.location,
          b.mode
        )) like '%' || p.query_text || '%'
      )
      and (
        p.location_filter = 'all'
        or b.location = p.location_filter
      )
      and (
        p.state_filter = 'all'
        or (
          p.state_filter = 'inactive'
          and b.effective_active is false
        )
        or (
          p.state_filter = 'open'
          and b.effective_active is true
          and b.enrollment_open is not false
          and (b.end_date is null or b.end_date >= p.today_date)
        )
        or (
          p.state_filter = 'closed'
          and b.enrollment_open is false
        )
        or (
          p.state_filter not in ('all','inactive','open','closed')
          and b.effective_active is true
          and (b.end_date is null or b.end_date >= p.today_date)
        )
      )
  ),
  upcoming_batches as materialized (
    select b.*
    from base_batches b
    cross join params p
    where b.effective_active is true
      and (b.end_date is null or b.end_date >= p.today_date)
  ),
  audit_base as materialized (
    select
      e.id,
      e.organization_id,
      e.batch_id,
      e.actor_user_id,
      e.action,
      e.created_at
    from public.course_batch_admin_events e
    where e.organization_id = p_organization_id
    order by e.created_at desc
    limit 20
  )
  select jsonb_build_object(
    'courses',
    coalesce((
      select jsonb_agg(
        to_jsonb(x)
        order by x.active desc, x.name asc, x.code asc
      )
      from courses_base x
    ), '[]'::jsonb),
    'batches',
    coalesce((
      select jsonb_agg(
        to_jsonb(x)
        order by x.start_date asc nulls last, x.course_name asc
      )
      from filtered_batches x
    ), '[]'::jsonb),
    'summary',
    jsonb_build_object(
      'upcoming_batches',
      (select count(*) from upcoming_batches),
      'total_capacity',
      coalesce((
        select sum(coalesce(capacity, 0))
        from upcoming_batches
        where capacity is not null
      ), 0),
      'total_enrolled',
      coalesce((
        select sum(coalesce(enrolled_count, 0))
        from upcoming_batches
      ), 0),
      'total_open_seats',
      coalesce((
        select sum(coalesce(calculated_seats_remaining, 0))
        from upcoming_batches
        where calculated_seats_remaining is not null
      ), 0),
      'closed_enrollment',
      (select count(*) from upcoming_batches where enrollment_open is false),
      'needs_capacity',
      (select count(*) from upcoming_batches where capacity is null),
      'demand_pressure',
      (
        select count(*)
        from upcoming_batches
        where coalesce(capacity_status, '') in (
          'overbooked',
          'full',
          'near_full',
          'payment_pressure',
          'demand_exceeds_open_seats'
        )
      )
    ),
    'locations',
    coalesce((
      select jsonb_agg(x.location)
      from (
        select distinct location
        from base_batches
        where location is not null
          and trim(location) <> ''
        order by location
      ) x
    ), '[]'::jsonb),
    'audits',
    coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from audit_base x
    ), '[]'::jsonb),
    'batch_names',
    coalesce((
      select jsonb_object_agg(x.batch_id::text, x.batch_name)
      from (
        select
          batch_id,
          coalesce(
            nullif(batch_code, ''),
            nullif(course_name, ''),
            'Batch'
          ) as batch_name
        from base_batches
      ) x
    ), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

commit;

-- -----------------------------------------------------------------------------
-- Re-engaged workspace v2 historical contracts
-- -----------------------------------------------------------------------------
-- These two aggregate views and the original v2 workspace function existed in
-- production before 20261028050611 but have no creator in the migration ledger.
-- Production still preserves the original function body as
-- get_reengaged_workspace_legacy_v2(). Reconstruct those pre-v3 contracts here
-- so the real 50611/50642 migrations can clone/promote them normally.

begin;

create or replace view public.v_lead_temperature_summary
with (security_invoker = true)
as
select
  behaviour_temperature,
  count(*) as lead_count,
  count(*) filter (where is_reengaged) as reengaged_count,
  count(*) filter (where sessions_7d > 0) as active_7d_count,
  round(avg(engagement_score), 1) as avg_engagement_score
from public.v_lead_journey_intelligence j
group by behaviour_temperature;

create or replace view public.v_conversion_visit_distribution
with (security_invoker = true)
as
select
  case
    when conversion_visit_number is null then 'unknown'::text
    when conversion_visit_number = 1 then '1st visit'::text
    when conversion_visit_number = 2 then '2nd visit'::text
    when conversion_visit_number >= 3 and conversion_visit_number <= 5 then '3-5 visits'::text
    else '6+ visits'::text
  end as visit_bucket,
  count(*) as lead_count,
  round(avg(conversion_visit_number) filter (where conversion_visit_number is not null), 2) as avg_visit_number,
  round(avg(days_first_visit_to_lead) filter (where days_first_visit_to_lead is not null), 2) as avg_days_to_lead,
  organization_id
from public.v_lead_journey_intelligence j
group by
  organization_id,
  case
    when conversion_visit_number is null then 'unknown'::text
    when conversion_visit_number = 1 then '1st visit'::text
    when conversion_visit_number = 2 then '2nd visit'::text
    when conversion_visit_number >= 3 and conversion_visit_number <= 5 then '3-5 visits'::text
    else '6+ visits'::text
  end;

create or replace function public.get_reengaged_workspace_v2()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with active_leads as (
    select
      to_jsonb(j) as row_json
    from public.v_lead_journey_intelligence j
    where
      coalesce(nullif(to_jsonb(j) ->> 'sessions_7d', '')::numeric, 0) > 0
      or coalesce(nullif(to_jsonb(j) ->> 'page_views_7d', '')::numeric, 0) > 0
      or coalesce(nullif(to_jsonb(j) ->> 'high_intent_events_7d', '')::numeric, 0) > 0
      or lower(coalesce(to_jsonb(j) ->> 'is_reengaged', 'false')) = 'true'
    order by
      nullif(to_jsonb(j) ->> 'last_visit_at', '')::timestamptz desc nulls last
    limit 250
  )
  select jsonb_build_object(
    'leads',
    coalesce(
      (select jsonb_agg(row_json) from active_leads),
      '[]'::jsonb
    ),
    'summary',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(s)
          order by
            case lower(coalesce(to_jsonb(s) ->> 'behaviour_temperature', ''))
              when 'hot' then 1
              when 'warm' then 2
              when 'cold' then 3
              when 'closed' then 4
              else 5
            end
        )
        from public.v_lead_temperature_summary s
      ),
      '[]'::jsonb
    ),
    'distribution',
    coalesce(
      (
        select jsonb_agg(to_jsonb(d))
        from public.v_conversion_visit_distribution d
      ),
      '[]'::jsonb
    )
  );
$function$;

commit;
