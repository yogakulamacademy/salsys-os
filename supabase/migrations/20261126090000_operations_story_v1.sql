-- Smart Operations Overview (owner-approved prototype "Operations prototype",
-- 26 Nov 2026). Read-only JSON for one business: active batches starting in
-- the next p_days days with warm demand for that course (and that place),
-- enrolments in each batch, setup gaps (seats, price), and enrolments by
-- course with or without a batch. Test leads are left out. Service role only.

create or replace function public.operations_story_v1(p_organization_id uuid, p_days integer default 60)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
-- Seat, price and enrolment columns are read via jsonb: some predate the tracked migrations.
future as (
  select cb.id, cb.course_id, cb.start_date, j ->> 'end_date' as end_date, j ->> 'location' as location, j ->> 'mode' as mode,
         (j ->> 'capacity')::numeric as capacity, (j ->> 'seats_remaining')::numeric as seats_remaining,
         coalesce(j ->> 'price_course_only', j ->> 'price_shared', j ->> 'price_private', j ->> 'expected_value') is not null as has_price,
         coalesce((j ->> 'enrollment_open')::boolean, true) as enrollment_open
  from public.course_batches cb, lateral (select to_jsonb(cb) as j) x
  where cb.organization_id = p_organization_id and cb.active and cb.start_date >= (now() at time zone 'Asia/Kolkata')::date
),
soon as (
  select f.*, c.name as course
  from future f join public.courses c on c.id = f.course_id
  where f.start_date < (now() at time zone 'Asia/Kolkata')::date + greatest(7, least(coalesce(p_days, 60), 180))
),
warm as (
  select distinct i.course_id, lower(btrim(coalesce(i.location, ''))) as loc, l.id as lead_id
  from public.lead_course_interests i
  join public.leads l on l.id = i.lead_id
  where i.organization_id = p_organization_id and i.status <> 'dropped'
    and l.current_stage::text in ('qualified', 'high_intent', 'payment_pending')
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
),
enr as (
  select e.course_id, e.batch_id, count(*) filter (where e.status in ('pending', 'confirmed', 'completed')) as n
  from public.enrollments e where e.organization_id = p_organization_id
  group by 1, 2
)
select jsonb_build_object(
  'days', greatest(7, least(coalesce(p_days, 60), 180)),
  'today', (now() at time zone 'Asia/Kolkata')::date,
  'batches', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'courseId', s.course_id, 'course', s.course, 'location', s.location, 'mode', s.mode,
      'start', s.start_date, 'end', s.end_date, 'capacity', s.capacity, 'seatsRemaining', s.seats_remaining,
      'hasPrice', s.has_price,
      'open', s.enrollment_open,
      'warmCourse', (select count(distinct w.lead_id) from warm w where w.course_id = s.course_id),
      'warmPlace', (select count(distinct w.lead_id) from warm w where w.course_id = s.course_id
          and (w.loc = '' or lower(coalesce(s.location, '')) = ''
               or position(w.loc in lower(s.location)) > 0 or position(lower(s.location) in w.loc) > 0)),
      'enrolled', coalesce((select n from enr where enr.batch_id = s.id), 0)
    ) order by s.start_date, s.course) from soon s), '[]'::jsonb),
  'future', (select count(*) from future),
  'futureWithSeats', (select count(*) from future where coalesce(capacity, 0) > 0),
  'futureWithPrice', (select count(*) from future where has_price),
  'enrolments', coalesce((select jsonb_agg(jsonb_build_object('course', c.name, 'withBatch', x.with_batch, 'noBatch', x.no_batch) order by coalesce(x.with_batch, 0) + coalesce(x.no_batch, 0) desc) from (
      select course_id, sum(n) filter (where batch_id is not null) as with_batch, sum(n) filter (where batch_id is null) as no_batch
      from enr group by 1) x join public.courses c on c.id = x.course_id
      where coalesce(x.with_batch, 0) + coalesce(x.no_batch, 0) > 0), '[]'::jsonb),
  'generatedAt', now()
);
$$;

revoke all on function public.operations_story_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.operations_story_v1(uuid, integer) to service_role;
