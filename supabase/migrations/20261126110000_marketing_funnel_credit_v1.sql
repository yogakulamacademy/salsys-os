-- Marketing "Stage by stage" and "Credit by source" pages (owner-approved
-- prototype "Where enquiries come from – inner pages", 26 Nov 2026).
-- Read-only, service role only. Test leads and duplicates are left out.
-- Enquiries from the last p_days days, grouped by channel, first and last
-- source, current stage, whether they are untouched / quiet, and whether they
-- have an enrolment (paid) with its value.
create or replace function public.marketing_funnel_credit_v1(p_organization_id uuid, p_days integer default 90)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
bounds as (select now() - make_interval(days => greatest(7, least(coalesce(p_days, 90), 180))) as since),
recent as (
  select l.id, l.created_at, l.owner_user_id,
         case when l.lead_creation_channel::text in ('website', 'instagram', 'whatsapp') then l.lead_creation_channel::text else 'other' end as channel,
         coalesce(nullif(lower(btrim(l.first_touch_source)), ''), 'unknown') as ft,
         coalesce(nullif(lower(btrim(l.last_touch_source)), ''), 'unknown') as lt,
         l.current_stage::text as stage,
         coalesce(l.last_inbound_at, l.created_at) < now() - interval '7 days' as quiet
  from public.leads l, bounds b
  where l.organization_id = p_organization_id
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
    and l.current_stage::text <> 'duplicate'
    and l.created_at >= b.since
),
paid as (
  select e.lead_id, count(*) as n, sum(coalesce(e.total_value, 0)) as value, max(upper(coalesce(e.currency, 'INR'))) as currency
  from public.enrollments e
  where e.organization_id = p_organization_id
    and e.status::text <> 'cancelled'
  group by 1
),
flagged as (
  select r.*, coalesce(p.n, 0) as paid_n, coalesce(p.value, 0) as paid_value, p.currency as paid_currency,
         r.stage = 'new'
           and not exists (select 1 from public.messages m where m.lead_id = r.id and m.direction = 'outbound')
           and not exists (select 1 from public.lead_contact_logs c where c.lead_id = r.id) as untouched
  from recent r left join paid p on p.lead_id = r.id
)
select jsonb_build_object(
  'days', greatest(7, least(coalesce(p_days, 90), 180)),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'channel', channel, 'ft', ft, 'lt', lt, 'stage', stage, 'quiet', quiet, 'untouched', untouched,
      'n', n, 'paid', paid_n, 'value', paid_value, 'currency', paid_currency, 'unowned', unowned, 'old', old_n)) from (
      select channel, ft, lt, stage, quiet, untouched, paid_currency,
             count(*) as n, sum(paid_n) as paid_n, sum(paid_value) as paid_value,
             count(*) filter (where owner_user_id is null) as unowned,
             count(*) filter (where created_at < now() - interval '3 days') as old_n
      from flagged group by channel, ft, lt, stage, quiet, untouched, paid_currency) g), '[]'::jsonb),
  'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', wk, 'n', n, 'qualified', q) order by wk) from (
      select to_char(date_trunc('week', created_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD') as wk, count(*) as n,
             count(*) filter (where stage in ('qualified', 'high_intent', 'payment_pending', 'closed_won', 'enrolled') or paid_n > 0) as q
      from flagged group by 1) w), '[]'::jsonb),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_funnel_credit_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.marketing_funnel_credit_v1(uuid, integer) to service_role;
