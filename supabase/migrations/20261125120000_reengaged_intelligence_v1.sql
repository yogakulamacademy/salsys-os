-- Smart Re-engaged briefing (owner-approved mockup "Smart Re-engaged", 25 Nov 2026).
-- Read-only JSON for one business: people who wrote back after 7+ days of
-- silence (since their previous message), per week (Monday weeks, IST), and
-- this week's comebacks with what they said, whether it answered our
-- check-in, and whether they are waiting on us. Test leads are left out.
-- Service role only. Value columns are read via jsonb (they predate the
-- tracked migrations).

create or replace function public.reengaged_intelligence_v1(p_organization_id uuid, p_weeks integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
bounds as (
  select (date_trunc('week', now() at time zone 'Asia/Kolkata') - make_interval(weeks => greatest(1, least(p_weeks, 26)) - 1)) as start_local,
         date_trunc('week', now() at time zone 'Asia/Kolkata') as this_week_local
),
inbound as (
  select m.id, m.lead_id, m.created_at, m.body,
         lag(m.created_at) over (partition by m.lead_id order by m.created_at) as prev_in
  from public.messages m
  where m.organization_id = p_organization_id and m.direction = 'inbound'
),
comebacks as (
  select i.*,
         date_trunc('week', i.created_at at time zone 'Asia/Kolkata') as week_local,
         exists (
           select 1 from public.messages o
           where o.lead_id = i.lead_id and o.direction = 'outbound'
             and o.created_at > i.prev_in and o.created_at < i.created_at
         ) as after_checkin
  from inbound i, bounds b
  where i.prev_in is not null
    and i.created_at - i.prev_in >= interval '7 days'
    and (i.created_at at time zone 'Asia/Kolkata') >= b.start_local
),
real_comebacks as (
  select c.* from comebacks c
  join public.leads l on l.id = c.lead_id and l.organization_id = p_organization_id
  where not coalesce((l.metadata ->> 'test_lead')::boolean, false)
),
weeks as (
  select gs::date as week_start
  from bounds b, generate_series(b.start_local, b.this_week_local, interval '1 week') gs
),
weekly as (
  select w.week_start,
         count(distinct c.lead_id) as people,
         count(distinct c.lead_id) filter (where c.after_checkin) as after_checkin
  from weeks w
  left join real_comebacks c on c.week_local::date = w.week_start
  group by w.week_start
),
this_week as (
  select distinct on (c.lead_id) c.lead_id, c.created_at, c.body, c.after_checkin,
         extract(epoch from (c.created_at - c.prev_in)) / 86400.0 as silent_days
  from real_comebacks c, bounds b
  where c.week_local = b.this_week_local
  order by c.lead_id, c.created_at
),
last_msg as (
  select distinct on (m.lead_id) m.lead_id, m.direction
  from public.messages m
  where m.organization_id = p_organization_id and m.lead_id in (select lead_id from this_week)
    and m.direction in ('inbound', 'outbound')
  order by m.lead_id, m.created_at desc
),
people as (
  select t.lead_id, t.created_at, left(coalesce(t.body, ''), 280) as body, t.after_checkin,
         round(t.silent_days::numeric, 1) as silent_days,
         coalesce(nullif(btrim(l.display_name), ''), l.lead_code, 'Lead') as name,
         l.current_stage::text as stage,
         l.current_contact_channel as channel,
         c.name as course,
         (to_jsonb(l) ->> 'potential_value')::numeric as value,
         coalesce(to_jsonb(l) ->> 'potential_currency', 'INR') as currency,
         coalesce(lm.direction = 'inbound', false) as waiting
  from this_week t
  join public.leads l on l.id = t.lead_id
  left join public.courses c on c.id = l.interested_course_id
  left join last_msg lm on lm.lead_id = t.lead_id
)
select jsonb_build_object(
  'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', week_start, 'people', people, 'afterCheckin', after_checkin) order by week_start) from weekly), '[]'::jsonb),
  'people', coalesce((select jsonb_agg(jsonb_build_object(
      'leadId', lead_id, 'at', created_at, 'body', body, 'afterCheckin', after_checkin, 'silentDays', silent_days,
      'name', name, 'stage', stage, 'channel', channel, 'course', course, 'value', value, 'currency', currency, 'waiting', waiting
    ) order by created_at desc) from (select * from people order by created_at desc limit 400) p), '[]'::jsonb),
  'generatedAt', now()
);
$$;

revoke all on function public.reengaged_intelligence_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.reengaged_intelligence_v1(uuid, integer) to service_role;
