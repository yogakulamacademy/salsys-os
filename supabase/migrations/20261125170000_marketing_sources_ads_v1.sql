-- Marketing "Where enquiries come from" and "Ads" pages (owner-approved
-- prototype "Marketing step 2", 25 Nov 2026). Read-only, service role only.
-- Test leads and duplicates are left out.

-- Enquiries from the last p_days days by channel and first-touch source, with
-- where each one is now, and how many are untouched (still New, no message
-- from us and no logged call or note).
create or replace function public.marketing_sources_v1(p_organization_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
bounds as (select now() - make_interval(days => greatest(7, least(coalesce(p_days, 30), 90))) as since),
recent as (
  select l.id, l.created_at, l.owner_user_id,
         case when l.lead_creation_channel::text in ('website', 'instagram', 'whatsapp') then l.lead_creation_channel::text else 'other' end as channel,
         coalesce(nullif(lower(btrim(l.first_touch_source)), ''), 'unknown') as source,
         case
           when l.current_stage::text = 'new' then 'new'
           when l.current_stage::text in ('contacted', 'engaged', 'nurture') then 'engaged'
           when l.current_stage::text in ('qualified', 'high_intent', 'payment_pending') then 'warm'
           when l.current_stage::text in ('closed_won', 'enrolled') then 'enrolled'
           else 'closed'
         end as bucket
  from public.leads l, bounds b
  where l.organization_id = p_organization_id
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
    and l.current_stage::text <> 'duplicate'
    and l.created_at >= b.since
),
flagged as (
  select r.*,
         r.bucket = 'new'
           and not exists (select 1 from public.messages m where m.lead_id = r.id and m.direction = 'outbound')
           and not exists (select 1 from public.lead_contact_logs c where c.lead_id = r.id) as untouched
  from recent r
),
overdue as (
  select f.id, count(*) as n
  from flagged f join public.tasks t on t.lead_id = f.id
  where f.untouched and t.status = 'open' and t.due_at < now()
  group by 1
)
select jsonb_build_object(
  'days', greatest(7, least(coalesce(p_days, 30), 90)),
  'sources', coalesce((select jsonb_agg(jsonb_build_object(
      'channel', channel, 'source', source, 'n', n, 'new', new_n, 'engaged', engaged_n, 'warm', warm_n,
      'enrolled', enrolled_n, 'closed', closed_n, 'untouched', untouched_n)) from (
      select channel, source, count(*) as n,
             count(*) filter (where bucket = 'new') as new_n, count(*) filter (where bucket = 'engaged') as engaged_n,
             count(*) filter (where bucket = 'warm') as warm_n, count(*) filter (where bucket = 'enrolled') as enrolled_n,
             count(*) filter (where bucket = 'closed') as closed_n, count(*) filter (where untouched) as untouched_n
      from flagged group by 1, 2) s), '[]'::jsonb),
  'untouched', jsonb_build_object(
      'n', (select count(*) from flagged where untouched),
      'unowned', (select count(*) from flagged where untouched and owner_user_id is null),
      'olderThan3Days', (select count(*) from flagged where untouched and created_at < now() - interval '3 days'),
      'overdueTasks', (select coalesce(sum(n), 0) from overdue)),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_sources_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.marketing_sources_v1(uuid, integer) to service_role;

-- Ad campaigns and weekly spend from the synced Meta and Google Ads tables, the
-- connection status of each, and how many recent enquiries carry a campaign.
create or replace function public.marketing_ads_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
meta as (
  select campaign_name as name, min(date) as first_day, max(date) as last_day, sum(spend) as spend,
         sum(coalesce(inline_link_clicks, clicks)) as clicks, max(currency_code) as currency
  from public.meta_ads_campaign_daily where organization_id = p_organization_id
  group by 1
),
google as (
  select campaign_name as name, min(date) as first_day, max(date) as last_day, sum(cost_micros) / 1e6 as spend,
         sum(clicks) as clicks, sum(conversions) as conversions
  from public.google_ads_campaign_daily where organization_id = p_organization_id
  group by 1
),
weeks as (
  select date_trunc('week', date)::date as week, 'meta' as platform, sum(spend) as spend
  from public.meta_ads_campaign_daily where organization_id = p_organization_id and date >= current_date - 182 group by 1
  union all
  select date_trunc('week', date)::date, 'google', sum(cost_micros) / 1e6
  from public.google_ads_campaign_daily where organization_id = p_organization_id and date >= current_date - 182 group by 1
),
sync as (
  select 'meta' as platform, status, coalesce(completed_at, started_at) as at, error_message
  from (select * from public.meta_ads_sync_runs where organization_id = p_organization_id order by started_at desc limit 1) m
  union all
  select 'google', status, coalesce(completed_at, started_at), error_message
  from (select * from public.google_ads_sync_runs where organization_id = p_organization_id order by started_at desc limit 1) g
)
select jsonb_build_object(
  'campaigns', coalesce((
      select jsonb_agg(c order by (c ->> 'spend')::numeric desc) from (
        select jsonb_build_object('platform', 'meta', 'name', name, 'firstDay', first_day, 'lastDay', last_day,
               'spend', round(spend, 2), 'clicks', clicks, 'conversions', null, 'currency', currency) as c from meta
        union all
        select jsonb_build_object('platform', 'google', 'name', name, 'firstDay', first_day, 'lastDay', last_day,
               'spend', round(spend, 2), 'clicks', clicks, 'conversions', conversions, 'currency', null) from google
      ) x), '[]'::jsonb),
  'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'platform', platform, 'spend', round(spend, 2)) order by week) from weeks), '[]'::jsonb),
  'sync', jsonb_build_object(
      'meta', (select jsonb_build_object('status', status, 'at', at,
                 'lastSuccessAt', (select max(completed_at) from public.meta_ads_sync_runs where organization_id = p_organization_id and status = 'success'),
                 'dataTo', (select max(date) from public.meta_ads_campaign_daily where organization_id = p_organization_id),
                 'error', left(regexp_replace(coalesce(error_message, ''), '\s+', ' ', 'g'), 300)) from sync where platform = 'meta'),
      'google', (select jsonb_build_object('status', status, 'at', at,
                 'lastSuccessAt', (select max(completed_at) from public.google_ads_sync_runs where organization_id = p_organization_id and status = 'success'),
                 'dataTo', (select max(date) from public.google_ads_campaign_daily where organization_id = p_organization_id),
                 'error', left(regexp_replace(coalesce(error_message, ''), '\s+', ' ', 'g'), 300)) from sync where platform = 'google')),
  'enquiries', (select jsonb_build_object('n', count(*), 'withCampaign', count(*) filter (where nullif(btrim(l.first_touch_campaign), '') is not null))
      from public.leads l
      where l.organization_id = p_organization_id and l.created_at >= now() - interval '30 days'
        and not coalesce((l.metadata ->> 'test_lead')::boolean, false)),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_ads_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_ads_v1(uuid) to service_role;
