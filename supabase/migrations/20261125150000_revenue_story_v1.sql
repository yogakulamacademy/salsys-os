-- Smart Revenue briefing (owner-approved mockup "Revenue", 25 Nov 2026).
-- Read-only JSON for one business over the last p_months calendar months (IST):
-- confirmed money per month and course, unconfirmed website checkouts, warm
-- people (High intent / Qualified / Engaged, and who wrote in the last 14
-- days), enquiries, and Meta ad spend per month with the last synced day.
-- Test leads (metadata.test_lead) are left out. Service role only. Value
-- columns are read via jsonb (they predate the tracked migrations).

create or replace function public.revenue_story_v1(p_organization_id uuid, p_months integer default 3)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
bounds as (
  select (date_trunc('month', now() at time zone 'Asia/Kolkata') - make_interval(months => greatest(1, least(p_months, 12)) - 1)) as start_local
),
real_leads as (
  select l.* from public.leads l
  where l.organization_id = p_organization_id
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
),
paid as (
  select p.lead_id, p.amount, coalesce(p.currency, 'INR') as currency,
         to_char(date_trunc('month', p.paid_at at time zone 'Asia/Kolkata'), 'YYYY-MM') as month,
         coalesce(ce.name, ci.name, 'Course not set') as course
  from public.payments p
  join real_leads l on l.id = p.lead_id
  left join public.enrollments e on e.id = p.enrollment_id
  left join public.courses ce on ce.id = e.course_id
  left join public.courses ci on ci.id = l.interested_course_id
  cross join bounds b
  where p.organization_id = p_organization_id and p.status = 'paid'
    and p.paid_at is not null and (p.paid_at at time zone 'Asia/Kolkata') >= b.start_local
),
checkouts as (
  select coalesce(p.currency, 'INR') as currency, count(*) as n, sum(p.amount) as amount
  from public.payments p
  join real_leads l on l.id = p.lead_id
  where p.organization_id = p_organization_id and p.status = 'pending'
    and p.provider not like 'team\_%'
    and l.current_stage::text not in ('closed_won', 'enrolled')
  group by 1
),
recent_writers as (
  select distinct m.lead_id from public.messages m
  where m.organization_id = p_organization_id and m.direction = 'inbound'
    and m.created_at > now() - interval '14 days'
),
warm as (
  select l.current_stage::text as stage, count(*) as people,
         count(r.lead_id) as recent,
         coalesce(sum((to_jsonb(l) ->> 'potential_value')::numeric) filter (where r.lead_id is not null and coalesce(to_jsonb(l) ->> 'potential_currency', 'INR') = 'INR'), 0) as recent_inr,
         count(r.lead_id) filter (where coalesce(to_jsonb(l) ->> 'potential_currency', 'INR') <> 'INR') as recent_intl
  from real_leads l
  left join recent_writers r on r.lead_id = l.id
  where l.current_stage::text in ('high_intent', 'qualified', 'engaged')
  group by 1
),
spend as (
  select to_char(date_trunc('month', d.date), 'YYYY-MM') as month, d.currency_code as currency, sum(d.spend) as amount
  from public.meta_ads_campaign_daily d, bounds b
  where d.organization_id = p_organization_id and d.date >= (b.start_local::date - interval '1 month')
  group by 1, 2
)
select jsonb_build_object(
  'since', (select to_char(start_local, 'YYYY-MM-DD') from bounds),
  'collected', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'course', course, 'currency', currency, 'amount', amount, 'payments', payments, 'people', people) order by month, course)
      from (select month, course, currency, sum(amount) as amount, count(*) as payments, count(distinct lead_id) as people from paid group by 1, 2, 3) x), '[]'::jsonb),
  'checkouts', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'count', n, 'amount', amount) order by currency) from checkouts), '[]'::jsonb),
  'paymentPending', (select count(*) from real_leads where current_stage::text = 'payment_pending'),
  'warm', coalesce((select jsonb_agg(jsonb_build_object('stage', stage, 'people', people, 'recent', recent, 'recentInr', recent_inr, 'recentIntl', recent_intl)) from warm), '[]'::jsonb),
  'enquiries', (select count(*) from real_leads l, bounds b where (l.created_at at time zone 'Asia/Kolkata') >= b.start_local),
  'adSpend', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'currency', currency, 'amount', amount) order by month) from spend), '[]'::jsonb),
  'adSpendLastDay', (select max(date) from public.meta_ads_campaign_daily where organization_id = p_organization_id),
  'generatedAt', now()
);
$$;

revoke all on function public.revenue_story_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.revenue_story_v1(uuid, integer) to service_role;
