-- Smart Pipeline briefing (owner-approved mockup "Pipeline v2", 25 Nov 2026).
-- Read-only JSON for one business: who sits at each open stage, how long since
-- the last message (and whether they are waiting on us), payment-pending ages,
-- moves to payment, and open value by course. Service role only.
-- Value columns are read via jsonb: they exist in production but predate the
-- tracked migrations.

create or replace function public.pipeline_intelligence_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
open_leads as (
  select l.id, l.current_stage::text as stage, l.interested_course_id,
         (to_jsonb(l) ->> 'potential_value')::numeric as value,
         coalesce(to_jsonb(l) ->> 'potential_value_source', '') as value_source
  from public.leads l
  where l.organization_id = p_organization_id
    and l.current_stage::text in ('qualified','high_intent','payment_pending')
),
lastmsg as (
  select distinct on (m.lead_id) m.lead_id, m.direction::text as direction, m.created_at
  from public.messages m join open_leads o on o.id = m.lead_id
  where m.organization_id = p_organization_id
  order by m.lead_id, m.created_at desc
),
x as (
  select o.*, c.name as course,
         lm.direction = 'inbound' as waiting,
         extract(epoch from now() - lm.created_at) / 86400 as idle_days,
         case when lm.created_at is null then 'none'
              when now() - lm.created_at < interval '3 days' then 'd0_2'
              when now() - lm.created_at < interval '8 days' then 'd3_7'
              when now() - lm.created_at < interval '15 days' then 'd8_14'
              when now() - lm.created_at < interval '31 days' then 'd15_30'
              else 'd30' end as bucket,
         (o.value_source like 'course_price:india%') as inr_priced
  from open_leads o left join lastmsg lm on lm.lead_id = o.id left join public.courses c on c.id = o.interested_course_id
),
cells as (
  select stage, bucket, count(*) as n, count(*) filter (where waiting) as waiting,
         coalesce(sum(value) filter (where inr_priced), 0) as inr,
         mode() within group (order by course) filter (where course is not null) as top_course
  from x group by stage, bucket
),
moves as (
  select count(distinct h.lead_id) filter (where h.to_stage::text = 'payment_pending' and h.from_stage::text = 'high_intent') as hi_to_payment,
         count(distinct h.lead_id) filter (where h.to_stage::text = 'payment_pending') as to_payment,
         count(distinct h.lead_id) filter (where h.to_stage::text in ('closed_won','enrolled')) as won
  from public.lead_stage_history h join public.leads l on l.id = h.lead_id
  where l.organization_id = p_organization_id and h.changed_at >= now() - interval '30 days'
),
by_course as (
  select course, count(*) as n, coalesce(sum(value) filter (where inr_priced), 0) as inr
  from x where course is not null group by course
)
select jsonb_build_object(
  'generatedAt', now(),
  'stages', (select coalesce(jsonb_object_agg(stage, n), '{}') from (select stage, count(*) n from x group by stage) s),
  'cells', (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'bucket', bucket, 'n', n, 'waiting', waiting, 'inr', inr, 'topCourse', top_course)), '[]') from cells),
  'highIntentWaiting', (select jsonb_build_object('n', count(*), 'inr', coalesce(sum(value) filter (where inr_priced), 0), 'medianDays', percentile_cont(0.5) within group (order by idle_days)) from x where stage = 'high_intent' and waiting),
  'payment', (select jsonb_build_object('n', count(*), 'monthPlus', count(*) filter (where bucket in ('d30','none')), 'inr', coalesce(sum(value) filter (where inr_priced), 0)) from x where stage = 'payment_pending'),
  'moves30', (select jsonb_build_object('highIntentToPayment', hi_to_payment, 'toPayment', to_payment, 'won', won) from moves),
  'open', (select jsonb_build_object('n', count(*), 'inr', coalesce(sum(value) filter (where inr_priced), 0), 'priced', count(*) filter (where inr_priced)) from x),
  'courses', (select coalesce(jsonb_agg(jsonb_build_object('course', course, 'n', n, 'inr', inr) order by inr desc), '[]') from by_course)
);
$$;

revoke all on function public.pipeline_intelligence_v1(uuid) from public, anon, authenticated;
grant execute on function public.pipeline_intelligence_v1(uuid) to service_role;
