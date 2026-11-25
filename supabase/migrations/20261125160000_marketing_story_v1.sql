-- Smart Marketing Overview (owner-approved prototype "Marketing prototype",
-- 25 Nov 2026). Read-only JSON for one business over the last p_days days:
-- enquiries by channel, week, course, first-touch source and reply speed;
-- how many became warm (Qualified or later) or paid; AI-assistant referrals by
-- month; missing course / country; ad connection sync status. Test leads are
-- left out. Service role only.

create or replace function public.marketing_story_v1(p_organization_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
bounds as (
  select now() - make_interval(days => greatest(7, least(coalesce(p_days, 30), 90))) as since,
         date_trunc('week', now() at time zone 'Asia/Kolkata') - interval '4 weeks' as weeks_from
),
real_leads as (
  select l.id, l.created_at, l.interested_course_id, l.first_touch_source, l.first_touch_campaign, l.metadata,
         case when l.lead_creation_channel in ('website', 'instagram', 'whatsapp') then l.lead_creation_channel else 'other' end as channel,
         l.current_stage::text in ('qualified', 'high_intent', 'payment_pending', 'enrolled', 'closed_won') as warm
  from public.leads l
  where l.organization_id = p_organization_id
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
),
recent as (
  select r.*, exists (select 1 from public.payments p where p.lead_id = r.id and p.status = 'paid') as paid
  from real_leads r, bounds b where r.created_at >= b.since
),
first_in as (
  select m.lead_id, min(m.created_at) as t
  from public.messages m
  join real_leads r on r.id = m.lead_id
  where m.organization_id = p_organization_id and m.direction = 'inbound'
  group by 1
  having min(m.created_at) >= (select since from bounds)
),
speed as (
  select f.lead_id,
         (select min(o.created_at) from public.messages o
           where o.lead_id = f.lead_id and o.direction = 'outbound' and o.created_at >= f.t) - f.t as wait
  from first_in f
),
speed_rows as (
  select r.channel,
         case when s.wait is null then 'never' when s.wait < interval '15 minutes' then 'm15'
              when s.wait < interval '2 hours' then 'h2' when s.wait < interval '24 hours' then 'h24' else 'later' end as bucket,
         count(*) as n, count(*) filter (where r.warm) as warm
  from speed s join real_leads r on r.id = s.lead_id
  group by 1, 2
),
ai_refs as (
  select to_char(date_trunc('month', r.created_at at time zone 'Asia/Kolkata'), 'YYYY-MM') as month, count(*) as n
  from real_leads r
  where r.created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '2 months'
    and r.first_touch_source ~* '(chatgpt|openai|perplexity|gemini\.google|copilot|claude\.ai)'
  group by 1
),
meta_run as (
  select status, started_at, completed_at from public.meta_ads_sync_runs
  where organization_id = p_organization_id order by started_at desc limit 1
),
meta_ok as (
  select max(completed_at) as at from public.meta_ads_sync_runs
  where organization_id = p_organization_id and status = 'success'
),
google_run as (
  select status, started_at, completed_at from public.google_ads_sync_runs
  where organization_id = p_organization_id order by started_at desc limit 1
),
google_ok as (
  select max(completed_at) as at from public.google_ads_sync_runs
  where organization_id = p_organization_id and status = 'success'
)
select jsonb_build_object(
  'days', greatest(7, least(coalesce(p_days, 30), 90)),
  'totals', coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'n', n, 'warm', warm, 'paid', paid, 'withCampaign', with_campaign)) from (
      select channel, count(*) as n, count(*) filter (where warm) as warm, count(*) filter (where paid) as paid,
             count(*) filter (where nullif(btrim(first_touch_campaign), '') is not null) as with_campaign from recent group by 1) t), '[]'::jsonb),
  'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'channel', channel, 'n', n) order by week) from (
      select to_char(date_trunc('week', r.created_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD') as week, r.channel, count(*) as n
      from real_leads r, bounds b where (r.created_at at time zone 'Asia/Kolkata') >= b.weeks_from group by 1, 2) w), '[]'::jsonb),
  'firstSeen', coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'at', at)) from (
      select channel, min(created_at) as at from real_leads group by 1) f), '[]'::jsonb),
  'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'channel', channel, 'n', n, 'warm', warm)) from (
      select coalesce(c.name, '') as course, r.channel, count(*) as n, count(*) filter (where r.warm) as warm
      from recent r left join public.courses c on c.id = r.interested_course_id group by 1, 2) c), '[]'::jsonb),
  'sources', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'channel', channel, 'n', n, 'warm', warm, 'paid', paid)) from (
      select coalesce(nullif(lower(btrim(first_touch_source)), ''), 'unknown') as source, channel, count(*) as n,
             count(*) filter (where warm) as warm, count(*) filter (where paid) as paid
      from recent group by 1, 2) s), '[]'::jsonb),
  'speed', coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'bucket', bucket, 'n', n, 'warm', warm)) from speed_rows), '[]'::jsonb),
  'aiReferrals', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'n', n) order by month) from ai_refs), '[]'::jsonb),
  'noCountry', (select count(*) from recent r where coalesce(r.metadata -> 'location' ->> 'country', r.metadata ->> 'location', '') = ''),
  'ads', jsonb_build_object(
      'meta', jsonb_build_object('lastStatus', (select status from meta_run), 'lastRunAt', (select coalesce(completed_at, started_at) from meta_run), 'lastSuccessAt', (select at from meta_ok)),
      'google', jsonb_build_object('lastStatus', (select status from google_run), 'lastRunAt', (select coalesce(completed_at, started_at) from google_run), 'lastSuccessAt', (select at from google_ok)),
      'spendLastDay', (select max(date) from public.meta_ads_campaign_daily where organization_id = p_organization_id)),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_story_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.marketing_story_v1(uuid, integer) to service_role;
